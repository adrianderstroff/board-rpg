import Phaser from "phaser";

export type InputAction = "up" | "down" | "left" | "right" | "confirm" | "cancel" | "menu" | "rotateLeft" | "rotateRight";

export interface PointerInfo {
  /** Screen (camera-independent) coordinates in virtual pixels. */
  x: number;
  y: number;
  /** World coordinates of the main camera. */
  worldX: number;
  worldY: number;
  button: number;
  /** The pointer is a finger (touch screen). */
  touch: boolean;
}

/** An on-screen button (touch controls) that sends an action instead of a tap. */
interface ScreenButton {
  x: number;
  y: number;
  w: number;
  h: number;
  action: InputAction;
  /** Inactive while hidden. */
  active?: () => boolean;
}

/** Movement (virtual px) after which a press becomes a drag instead of a tap. */
const DRAG_THRESHOLD = 6;

/** A focusable input consumer. Return true to mark the input as handled. */
export interface InputHandler {
  onAction?(action: InputAction): boolean | void;
  onPointerMove?(p: PointerInfo): boolean | void;
  onPointerDown?(p: PointerInfo): boolean | void;
  onWheel?(dy: number): boolean | void;
}

const KEYMAP: Record<string, InputAction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  KeyW: "up",
  KeyS: "down",
  KeyA: "left",
  KeyD: "right",
  Enter: "confirm",
  Space: "confirm",
  KeyZ: "confirm",
  Escape: "cancel",
  Backspace: "cancel",
  KeyX: "cancel",
  KeyM: "menu",
  KeyQ: "rotateLeft",
  KeyE: "rotateRight",
  Tab: "menu",
};

/** Standard gamepad mapping: A confirm, B cancel, X/Y/Start menu, Select cancel. D-pad is polled. */
const PAD_BUTTONS: Record<number, InputAction> = { 0: "confirm", 1: "cancel", 2: "menu", 3: "menu", 4: "rotateLeft", 5: "rotateRight", 8: "cancel", 9: "menu" };

/**
 * Focus stack: only the top handler receives input (menus on top of the board cursor, etc).
 * Keyboard, mouse and touch are unified into actions + pointer events.
 */
export class InputRouter {
  private stack: InputHandler[] = [];
  private enabled = true;
  private buttons: ScreenButton[] = [];
  private press: { x: number; y: number; lastX: number; lastY: number; dragging: boolean } | null = null;
  /** Handles actions before the focus stack (e.g. map rotation); return true to consume. */
  onGlobalAction?: (a: InputAction) => boolean;
  /** Receives drag deltas (screen px), e.g. to pan the camera. Drags never produce taps. */
  onDrag?: (dx: number, dy: number) => void;

  constructor(private readonly scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    kb?.on("keydown", (e: KeyboardEvent) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      e.preventDefault();
      this.dispatch((h) => h.onAction?.(a), a);
    });
    // Taps fire on release so a press can turn into a drag (touch panning) without selecting anything.
    scene.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) {
        this.dispatch((h) => h.onAction?.("cancel"));
        return;
      }
      const button = this.buttons.find((b) => (b.active?.() ?? true) && p.x >= b.x && p.y >= b.y && p.x < b.x + b.w && p.y < b.y + b.h);
      if (button) {
        this.press = null;
        this.dispatch((h) => h.onAction?.(button.action), button.action);
        return;
      }
      this.press = { x: p.x, y: p.y, lastX: p.x, lastY: p.y, dragging: false };
    });
    scene.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      const pr = this.press;
      if (pr && p.isDown) {
        if (!pr.dragging && Math.hypot(p.x - pr.x, p.y - pr.y) > DRAG_THRESHOLD && this.onDrag) pr.dragging = true;
        if (pr.dragging) {
          this.onDrag?.(p.x - pr.lastX, p.y - pr.lastY);
          pr.lastX = p.x;
          pr.lastY = p.y;
          return;
        }
      }
      this.dispatch((h) => h.onPointerMove?.(this.info(p)));
    });
    scene.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      const pr = this.press;
      this.press = null;
      if (!pr || pr.dragging) return;
      const info = this.info(p);
      this.dispatch((h) => h.onPointerDown?.(info));
    });
    scene.input.on("wheel", (_p: unknown, _o: unknown, _dx: number, dy: number) => this.dispatch((h) => h.onWheel?.(dy)));
    scene.input.mouse?.disableContextMenu();
    this.setupGamepad();
    scene.events.once("shutdown", () => (this.stack = []));
  }

  // ---------- gamepad (standard mapping) ----------

  private padHeld: InputAction | null = null;
  private padRepeatAt = 0;

  private setupGamepad() {
    const gp = this.scene.input.gamepad;
    if (!gp) return;
    gp.on("down", (_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button) => {
      const a = PAD_BUTTONS[button.index];
      if (a) this.dispatch((h) => h.onAction?.(a), a);
    });
    this.scene.events.on("update", this.pollPad, this);
    this.scene.events.once("shutdown", () => this.scene.events.off("update", this.pollPad, this));
  }

  /** D-pad and left stick directions with key-repeat. */
  private pollPad(time: number) {
    const pad = this.scene.input.gamepad?.pad1;
    if (!pad) return;
    const x = pad.left ? -1 : pad.right ? 1 : Math.abs(pad.leftStick.x) > 0.5 ? Math.sign(pad.leftStick.x) : 0;
    const y = pad.up ? -1 : pad.down ? 1 : Math.abs(pad.leftStick.y) > 0.5 ? Math.sign(pad.leftStick.y) : 0;
    const dir: InputAction | null = y < 0 ? "up" : y > 0 ? "down" : x < 0 ? "left" : x > 0 ? "right" : null;
    if (dir !== this.padHeld) {
      this.padHeld = dir;
      this.padRepeatAt = time + 320;
      if (dir) this.dispatch((h) => h.onAction?.(dir));
    } else if (dir && time >= this.padRepeatAt) {
      this.padRepeatAt = time + 110;
      this.dispatch((h) => h.onAction?.(dir));
    }
  }

  private info(p: Phaser.Input.Pointer): PointerInfo {
    const cam = this.scene.cameras.main;
    const w = cam.getWorldPoint(p.x, p.y);
    return { x: p.x, y: p.y, worldX: w.x, worldY: w.y, button: p.button, touch: p.wasTouch };
  }

  private dispatch(fn: (h: InputHandler) => boolean | void, action?: InputAction) {
    if (!this.enabled) return;
    if (action && this.onGlobalAction?.(action)) return;
    const top = this.stack[this.stack.length - 1];
    if (top) fn(top);
  }

  /** Makes `handler` the focused input consumer; call the returned function to release it. */
  push(handler: InputHandler): () => void {
    this.stack.push(handler);
    return () => {
      const i = this.stack.lastIndexOf(handler);
      if (i >= 0) this.stack.splice(i, 1);
    };
  }

  /** Registers a screen-space rectangle that sends `action` when pressed. Returns an unregister function. */
  addButton(rect: { x: number; y: number; w: number; h: number }, action: InputAction, active?: () => boolean): () => void {
    const b = { ...rect, action, active };
    this.buttons.push(b);
    return () => {
      this.buttons = this.buttons.filter((x) => x !== b);
    };
  }

  /** True while a finger/mouse press is being used to drag. */
  get dragging() {
    return !!this.press?.dragging;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
  }

  /** Resolves on the next confirm/cancel (or click). */
  waitConfirm(): Promise<boolean> {
    return new Promise((resolve) => {
      const release = this.push({
        onAction: (a) => {
          if (a === "confirm" || a === "cancel") {
            release();
            resolve(a === "confirm");
          }
          return true;
        },
        onPointerDown: () => {
          release();
          resolve(true);
          return true;
        },
      });
    });
  }
}
