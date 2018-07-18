/**
 * Generic output from a search with cursor based paging.
 */
export interface FindOutput<T, U = string> {
  docs: T[]
  cursor: U
}
