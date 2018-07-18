/**
 * Generic input parameters to perform a search with cursor based paging.
 */
export interface FindInput {
  q?: string
  limit?: number
  cursor?: string
}
