import { MongoService } from '@ts-app/mongo'
import { assert, FindInput, FindOutput, User, makeTimestampable } from '@ts-app/common'
import { Observable, of, throwError } from 'rxjs'
import { concatMap, mapTo, map, catchError, toArray } from 'rxjs/operators'
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

    return this.mongoService.cursor<Role>('roles', { name: { $in: input.roles } }).pipe(
      concatMap(cursor => cursor.toArray()),
      // --- create missing role(s) in role collection
      concatMap(matchingRolesInDb => {
        const rolesNotInDb = input.roles.filter(roleName => !matchingRolesInDb.find(roleInDb => roleInDb.name === roleName))
        if (rolesNotInDb) {
          return of(...rolesNotInDb).pipe(
            concatMap(roleName => this.createRole(roleName))
          ).pipe(toArray())
        } else {
          return of(null)
        }
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
    let filter
    if (input.role) {
      filter = {
        _id: new ObjectId(input.userId),
        'roles.role': input.role
      }
    } else {
      filter = { _id: new ObjectId(input.userId) }
    }

    return this.mongoService.get<User>('users', filter, {
      fields: { roles: 1 }
    }).pipe(
      concatMap(user => {
        if (!user) {
          // error if cannot find user, return empty array
          return of([])
        } else if (input.role) {
          // return groups where user has specified role assigned (except global)
          const groupNames = user.roles
            .filter(currentRole => currentRole.group !== RoleService.GLOBAL && currentRole.role === input.role)
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
    let filter: any = { _id: new ObjectId(input.userId) }

    if (input.group) {
      filter = {
        ...filter,
        'roles.group': { $in: [ RoleService.GLOBAL, input.group ] }
      }
    }

    return this.mongoService.get<User>('users', filter, { fields: { roles: 1 } }).pipe(
      map(user => {
        if (user && user.roles) {
          // filter for global group
          // if group specified, filter by group
          const roles = user.roles
            .filter(role => role.group === RoleService.GLOBAL || !input.group || role.group === input.group)
            .map(role => role.role)

          return Array.from(new Set(roles))
        } else {
          return []
        }
      })
    )
  }

  getUsersInRoles (input: { roles: string[]; group?: string; limit?: number; cursor?: string }): Observable<FindOutput<User>> {
    let filter
    if (input.group) {
      filter = {
        roles: {
          $elemMatch: {
            role: { $in: input.roles },
            group: input.group
          }
        }
      }
    } else {
      filter = {
        'roles.role': { $in: input.roles }
      }
    }

    return this.mongoService.findWithCursor<User>('users', filter,
      input.limit, input.cursor, [ { field: 'profile.displayName', asc: true } ])
  }

  isUserInRoles (input: { userId: string; roles: string[]; group?: string }): Observable<boolean> {
    const filter = {
      _id: new ObjectId(input.userId),
      roles: {
        $elemMatch: {
          role: { $in: input.roles },
          group: {
            $in: input.group ? [ input.group, RoleService.GLOBAL ] : [ RoleService.GLOBAL ]
          }
        }
      }
    }

    return this.mongoService.findWithCursor<User>('users', filter, 1).pipe(
      map(users => users.docs.length > 0),
      catchError(e => {
        // whenever error happens, return as user not in role
        console.error(`Error checking if user [${input.userId}] is in roles`, e)
        return of(false)
      })
    )
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
    const filter = {
      _id: { $in: input.userIds.map(id => new ObjectId(id)) }
    }
    const update = {
      $unset: {
        roles: ''
      }
    }

    return this.mongoService.collection('users').pipe(
      concatMap(users => users.updateMany(filter, update)),
      map(updateMany => {
        if (updateMany.result.ok === 1) {
          return null
        } else {
          throw new Error(`Error removing roles for users ${input.userIds}`)
        }
      })
    )
  }

  removeUsersFromRoles (input: { userIds: string[]; roles: string[]; group?: string }): Observable<null> {
    if (input.group) {
      return throwError('Unsupported input parameter [group] for removeUsersFromRoles()')
    }

    const filter = {
      _id: { $in: input.userIds.map(id => new ObjectId(id)) }
    }
    const update = {
      $pull: {
        roles: {
          role: { $in: input.roles }
        }
      }
    }

    return this.mongoService.collection('users').pipe(
      concatMap(users => users.updateMany(filter, update)),
      map(updateMany => {
        if (updateMany.result.ok === 1) {
          return null
        } else {
          throw new Error(`Error removing roles ${input.roles} for users ${input.userIds}`)
        }
      })
    )
  }

  role (id: string): Observable<Role | null> {
    return this.mongoService.get('roles', id)
  }

  updateRole (id: string, role: Partial<Role>): Observable<null> {
    return this.mongoService.update('roles', id, {
      $set: {
        modifiedDate: new Date(),
        name: role.name
      }
    })
  }
}
