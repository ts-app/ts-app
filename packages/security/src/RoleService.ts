import { FindInput, FindOutput, User } from '@ts-app/common'
import { Role } from './Role'
import { Observable } from 'rxjs'

/**
 * Role service allows assignment of roles to users for authorization purposes. It also provides
 * functions to check roles assigned to user, based on groups.
 *
 * Credits: This interface was heavily inspired by alanning/roles-npm.
 */
export abstract class RoleService {
  static GLOBAL = '_global_'

  /**
   * Add users to specified roles, optionally specifying a group. If group name is not specified,
   * roles are assigned to RoleServiceConstants.GLOBAL group.
   */
  abstract addUsersToRoles (input: {
    userIds: string[], roles: string[],
    group?: string
  }): Observable<null>

  /**
   * Create specified role name.
   */
  abstract createRole (name: string): Observable<string>

  /**
   * Delete specified role name.
   *
   * Returns true if the specified role name exist, is not used and was removed. Otherwise, this
   * function returns false.
   */
  abstract removeRole (name: string): Observable<boolean>

  /**
   * Get user's groups where user has role(s) assigned. RoleServiceConstants.GLOBAL will be omitted.
   *
   * If role is specified, restrict groups returned to those with specified role assigned.
   */
  abstract getGroupsForUser (input: { userId: string, role?: string }): Observable<string[]>

  /**
   * Find roles with option to filter, limit and perform pagination on results.
   */
  abstract findRoles (input: FindInput): Observable<FindOutput<Role>>

  /**
   * Get roles assigned to user, optionally restricting specifying a group. Roles assigned to
   * RoleServiceConstants.GLOBAL will be included.
   *
   * If group name is not specified, all roles including those assigned to
   * RoleServiceConstants.GLOBAL are returned.
   */
  abstract getRolesForUser (input: { userId: string, group?: string }): Observable<string[]>

  /**
   * Get users with specified role(s) and group. User is considered a match if at least one role
   * matches.
   */
  abstract getUsersInRoles (input: { roles: string[], group?: string, limit?: number, cursor?: string }): Observable<FindOutput<User>>

  /**
   * Unassign user(s) from specified role(s).
   */
  abstract removeUsersFromRoles (input: { userIds: string[], roles: string[], group?: string }): Observable<null>

  /**
   * Remove all assigned roles from specified user(s).
   */
  abstract removeUsersFromAllRoles (input: { userIds: string[] }): Observable<null>

  /**
   * Returns true if user is assigned to one or more of the specified rule(s). This can be further
   * restricted based on group name.
   */
  abstract isUserInRoles (input: { userId: string, roles: string[], group?: string }): Observable<boolean>

  /**
   * Get role with the specified ID.
   *
   * @param id
   */
  abstract role (id: string): Observable<Role | null>

  abstract updateRole (id: string, role: Partial<Role>): Observable<null>
}
