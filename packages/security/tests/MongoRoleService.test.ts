import { ConsoleLogService, LogService, omitVolatile, User } from '@ts-app/common'
import { MongoService } from '@ts-app/mongo'
import { of } from 'rxjs'
import { catchError, concatMap, tap, toArray, mapTo, map } from 'rxjs/operators'
import { MongoRoleService, RoleService, MongoSecurityService, SecurityService } from '../src'

describe('MongoRoleService', async () => {
  const localUrl = 'mongodb://localhost:27017'
  let logService: LogService = new ConsoleLogService()
  let mongoService: MongoService
  let securityService: SecurityService
  let roleService: RoleService

  beforeEach(done => {

    mongoService = new MongoService(localUrl)
    securityService = new MongoSecurityService(mongoService)
    roleService = new MongoRoleService(mongoService)
    of('users', 'roles').pipe(
      concatMap(collection => mongoService.dropCollection(collection)),
      catchError(e => {
        // just ignore if cannot drop
        console.debug(e)
        return of(null)
      })
    ).subscribe(
      undefined,
      e => console.error(e),
      () => done()
    )
  })

  afterEach(done => mongoService.close().subscribe(() => done()))

  const omitVolatileUser = (user: User) => {
    const clone = omitVolatile(user)
    delete clone.services.password.bcrypt
    return clone
  }

  const createTestUsers$ = (displayNames: string[] = [
    'user-1',
    'user-2',
    'user-3',
    'user-4',
    'user-5',
    'admin',
    'superadmin'
  ]) => {
    return of(...displayNames).pipe(
      concatMap(name =>
        securityService.signUp({
          email: `${name}@test.local`,
          password: 'abc123'
        })),
      tap(user => expect(omitVolatileUser(user.user!)).toMatchSnapshot()),
      toArray(),
      map(users => ({
        user1: users[ 0 ].user!.id,
        user2: users[ 1 ].user!.id,
        user3: users[ 2 ].user!.id,
        user4: users[ 3 ].user!.id,
        user5: users[ 4 ].user!.id,
        admin: users[ 5 ].user!.id,
        superadmin: users[ 6 ].user!.id
      })),
      concatMap(({ user1, user2, user3, user4, user5, admin, superadmin }) => {
        return roleService.addUsersToRoles({
          userIds: [ user1, user2, user3, user4, user5 ],
          roles: [ 'members' ]
        }).pipe(
          concatMap(() => roleService.addUsersToRoles({
            userIds: [ user2 ],
            roles: [ 'users-two', 'admins' ],
            group: 'site-2'
          })),
          concatMap(() => roleService.addUsersToRoles({
            userIds: [ admin, superadmin ],
            roles: [ 'users', 'admins' ],
            group: 'site-5'
          })),
          concatMap(() => roleService.addUsersToRoles({
            userIds: [ superadmin ],
            roles: [ 'superadmins' ]
          })),
          mapTo({ user1, user2, user3, user4, user5, admin, superadmin })
        )
      })
    )
  }

  test('addUsersToRoles', done => {
    // addUsersToRoles() is called from createTestUsers$()
    createTestUsers$().pipe(
      concatMap(userIds => of(...Object.values(userIds))),
      concatMap(userId => securityService.user(userId)),
      tap(user => expect(omitVolatileUser(user!)).toMatchSnapshot())
    ).subscribe(
      undefined,
      undefined,
      () => {
        expect.assertions(14)
        done()
      }
    )
  })

  test('removeRole()', done => {
    const findRoles$ = roleService.findRoles({ project: { name: 1, _id: 0 } })

    createTestUsers$().pipe(
      // --- cannot remove roles that don't exist
      // --- cannot remove roles in use
      concatMap(() => findRoles$),
      tap(roles => expect(roles).toMatchSnapshot()),
      concatMap(() => of(...[ 'non-members', 'members' ])),
      concatMap(role => roleService.removeRole(role)),
      tap(removeRole => expect(removeRole).toBeFalsy()),
      toArray(),
      // --- can remove unused role
      concatMap(() => roleService.createRole('unused-role')),
      tap(id => expect(id.length).toBe(24)),
      concatMap(() => roleService.removeRole('unused-role')),
      tap(removeRole => expect(removeRole).toBeTruthy())
    ).subscribe(
      undefined,
      undefined,
      () => {
        expect.assertions(12)
        done()
      }
    )
  })

  test('getGroupsForUser()', done => {
    createTestUsers$().pipe(
      concatMap(userIds => of(...Object.values(userIds))),
      concatMap(userId => roleService.getGroupsForUser({ userId })),
      toArray(),
      tap(groupsForUser => expect(groupsForUser).toMatchSnapshot())
    ).subscribe(
      undefined,
      undefined,
      () => done()
    )
  })

  test('getGroupsForUser() with invalid user ID', done => {
    roleService.getGroupsForUser({ userId: '123456789012' })
      .subscribe(
        groups => expect(groups).toEqual([]),
        undefined,
        () => {
          expect.assertions(1)
          done()
        }
      )
  })

  test('getGroupsForUser() with invalid parameters', done => {
    createTestUsers$().pipe(
      // --- invalid user ID
      concatMap(userIds => {
        return roleService.getGroupsForUser({ userId: '123456789012' }).pipe(
          catchError(e => {
            expect(e).toBe('Error getting groups for user [123456789012]')
            return of(null)
          }),
          mapTo(userIds)
        )
      }),
      // --- user ID with no groups
      concatMap(userIds => {
        return roleService.getGroupsForUser({ userId: userIds.user1 }).pipe(
          tap(getGroupsForUser => expect(getGroupsForUser).toEqual([])),
          mapTo(userIds)
        )
      }),
      // --- user ID with group but not specifying role
      concatMap(userIds => {
        return roleService.getGroupsForUser({ userId: userIds.user2 }).pipe(
          tap(getGroupsForUser => expect(getGroupsForUser).toEqual([ 'site-2' ])),
          mapTo(userIds)
        )
      }),
      // --- user ID with group and specify role name that does not exist
      concatMap(userIds => {
        return roleService.getGroupsForUser({ userId: userIds.user2, role: 'no-such-role' }).pipe(
          tap(getGroupsForUser => expect(getGroupsForUser).toEqual([])),
          mapTo(userIds)
        )
      }),
      // --- user ID with group and specify role name that does exist but not assigned to this user
      concatMap(userIds => {
        return roleService.getGroupsForUser({ userId: userIds.user2, role: 'superadmins' }).pipe(
          tap(getGroupsForUser => expect(getGroupsForUser).toEqual([])),
          mapTo(userIds)
        )
      }),
      // --- user ID with group and specify correct role name
      concatMap(userIds => {
        return roleService.getGroupsForUser({ userId: userIds.user2, role: 'admins' }).pipe(
          tap(getGroupsForUser => expect(getGroupsForUser).toEqual([ 'site-2' ])),
          mapTo(userIds)
        )
      })
    ).subscribe(
      undefined,
      undefined,
      () => {
        expect.assertions(12)
        done()
      }
    )
  })

  test('findRoles()', done => {
    createTestUsers$().pipe(
      concatMap(() => roleService.findRoles({ project: { name: 1, _id: 0 } })),
      tap(roles => expect(roles).toMatchSnapshot())
    ).subscribe(
      undefined,
      undefined,
      () => {
        expect.assertions(8)
        done()
      }
    )
  })
})
