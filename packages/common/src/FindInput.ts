/**
 * Generic input parameters to perform a search with cursor based paging.
 */
export interface FindInput {
  /**
   * Query string to search against. It is up to implementations to decide what to search based on
   * the value of the search query.
   */
  q?: string
  /**
   * Maximum number of results to return.
   */
  limit?: number
  cursor?: string
  /**
   * Array of field names to sort against.
   */
  sort?: { field: string, asc: boolean }[]
  /**
   * A MongoDB specific parameter that represents fields to project.
   */
  project?: object
}
