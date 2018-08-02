import { MongoService } from '@ts-app/mongo'
import { assert, FindInput, FindOutput, User, makeTimestampable } from '@ts-app/common'
import { Observable, of, throwError, from } from 'rxjs'
import { concatMap, mapTo, tap, map, toArray, defaultIfEmpty } from 'rxjs/operators'
import { RoleService } from './RoleService'
import { Role } from './Role'
import { ObjectId } from 'bson'

export class MongoRoleService extends RoleService {
  constructor (private mongoService: MongoService) {
    super()
  }

  addUsersToRoles (input: { userIds: string[]; roles: string[]; group?: string }): Observable<null> {
    input.group = input.group || MongoRoleService.GLOBAL.replace(/\./g, '_')

    if (input.group.startsWith('$')) {
      return throwError('Group cannot start with \'$\'')
    }

    // --- create missing roles in role collection
    return this.mongoService.cursor<Role>('roles', { name: { $in: input.roles } }).pipe(
      concatMap(cursor => cursor.toArray()),
      concatMap(matchingRolesInDb => {
        const rolesNotInDb = input.roles.filter(roleName => !matchingRolesInDb.find(roleInDb => roleInDb.name === roleName))
        return of(...rolesNotInDb).pipe(
          concatMap(roleName => this.createRole(roleName))
        )
      }),

      // --- assign roles to users collection
      concatMap(() => this.mongoService.collection('users')),

      concatMap(Users => Users.updateMany(
        {
          _id: { $in: input.userIds.map(id => new ObjectId(id)) }
        },
        {
          $addToSet: {
            roles: {
              $each: input.roles.map(role => ({ role, group: input.group }))
            }
          }
        })),
      mapTo(null)
    )
  }

  createRole (name: string): Observable<string> {
    assert(!!name, 'Role name required')

    return this.mongoService.create<Role>(
      'roles',
      { name, ...makeTimestampable() }
    )
  }

  findRoles (input: FindInput): Observable<FindOutput<Role>> {
    return this.mongoService.find('roles', input, [ 'name' ])
  }

  getGroupsForUser (input: { userId: string; role?: string }): Observable<string[]> {
    const { role, userId } = input
    let filter
    if (role) {
      filter = {
        _id: new ObjectId(userId),
        'roles.role': role
      }
    } else {
      filter = { _id: new ObjectId(userId) }
    }

    return this.mongoService.get<User>('users', filter, {
      fields: { roles: 1 }
    }).pipe(
      concatMap(user => {
        if (!user) {
          // error if cannot find user, return empty array
          return of([])
        } else if (role) {
          // return groups where user has specified role assigned (except global)
          const groupNames = user.roles
            .filter(currentRole => currentRole.group !== RoleService.GLOBAL && currentRole.role === role)
            .map(currentRole => currentRole.group)

          return of(Array.from(new Set(groupNames)))
        } else {
          // role not specified, return all groups assigned to user (except global)
          const groupNames = user.roles.filter(currentRole => currentRole.group !== RoleService.GLOBAL)
            .map(currentRole => currentRole.group)

          return of(Array.from(new Set(groupNames)))
        }
      })
    )
  }

  getRolesForUser (input: { userId: string; group?: string }): Observable<string[]> {
    const { userId, group } = input
    let filter: any = { _id: new ObjectId(userId) }

    if (group) {
      filter = {
        ...filter,
        'roles.group': { $in: [ RoleService.GLOBAL, group ] }
      }
    }

    return this.mongoService.get<User>('users', filter, { fields: { roles: 1 } }).pipe(
      map(user => {
        if (user && user.roles) {
          // filter for global group
          // if group specified, filter by group
          const roles = user.roles
            .filter(role => role.group === RoleService.GLOBAL || !group || role.group === group)
            .map(role => role.role)

          return Array.from(new Set(roles))
        } else {
          return []
        }
      })
    )
  }

  getUsersInRoles (input: { roles: string[]; group?: string; limit?: number; cursor?: string }): Observable<FindOutput<User>> {
    return undefined
  }

  isUserInRoles (input: { userId: string; roles: string[]; group?: string }): Observable<boolean> {
    return undefined
  }

  removeRole (name: string): Observable<boolean> {
    return this.mongoService.get(
      'users',
      { 'roles.role': name },
      { fields: { _id: 1 } }
    ).pipe(
      concatMap(userWithRole => userWithRole ? of(false) :
        this.mongoService.remove('roles', { name }).pipe(
          map(remove => !!remove)
        ))
    )
  }

  removeUsersFromAllRoles (input: { userIds: string[] }): Observable<null> {
    return undefined
  }

  removeUsersFromRoles (input: { userIds: string[]; roles: string[]; group?: string }): Observable<null> {
    return undefined
  }

}
