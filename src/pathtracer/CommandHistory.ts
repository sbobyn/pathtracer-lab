export interface ReversibleCommand {
  readonly label: string;
  execute(): void;
  undo(): void;
}

export interface CommandHistorySnapshot {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
}

/** Bounded history for edits that have already been applied to authoritative state. */
export default class CommandHistory {
  private readonly undoStack: ReversibleCommand[] = [];
  private readonly redoStack: ReversibleCommand[] = [];
  private readonly limit: number;

  constructor(limit = 100) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError("Command history limit must be a positive integer");
    }
    this.limit = limit;
  }

  public execute(command: ReversibleCommand) {
    command.execute();
    this.record(command);
  }

  public record(command: ReversibleCommand) {
    this.undoStack.push(command);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  public undo() {
    const command = this.undoStack.pop();
    if (!command) return false;
    command.undo();
    this.redoStack.push(command);
    return true;
  }

  public redo() {
    const command = this.redoStack.pop();
    if (!command) return false;
    command.execute();
    this.undoStack.push(command);
    return true;
  }

  public clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  public getSnapshot(): CommandHistorySnapshot {
    return {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      undoLabel: this.undoStack.at(-1)?.label ?? null,
      redoLabel: this.redoStack.at(-1)?.label ?? null,
    };
  }
}
