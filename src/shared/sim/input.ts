/** What Handling reads once per step. Produced by the client's input layer (and, later, the server's input queue). */
export interface InputFrame {
  gas: boolean
  brake: boolean
  /** One-shot: the jump control was pressed since the last sample. */
  jump: boolean
  /** One-shot: the Use control was pressed since the last sample. */
  use: boolean
}
