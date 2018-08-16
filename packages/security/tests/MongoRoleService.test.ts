import { omitVolatile, User } from '@ts-app/common'
import { MongoService } from '@ts-app/mongo'
import { of, forkJoin } from 'rxjs'
import { catchError, concatMap, tap, toArray, mapTo, map } from 'rxjs/operators'
import {
  MongoRoleService,
  RoleService,
  MongoSecurityService,
  SecurityService,
  TokenService, InMemoryUserRefreshTokenRepository
} from '../src'

describe('MongoRoleService', async () => {
  const localUrl = 'mongodb://localhost:27017'
  const tokenService = new TokenService('test-key', 'test-key')
  const tokenRepository = new InMemoryUserRefreshTokenRepository()
  let mongoService: MongoService
  let securityService: SecurityService
  let roleService: RoleService

  beforeEach(done => {
    mongoService = new MongoService(localUrl)
    securityService = new MongoSecurityService(mongoService, tokenService, tokenRepository)
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
            userIds: [ user2, admin, superadmin ],
            roles: [ 'users', 'admins' ],
            group: 'site-5'
          })),
          concatMap(() => roleService.addUsersToRoles({
            userIds: [ user5, superadmin ],
            roles: [ 'superadmins' ],
            group: 'site-2'
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
      () => {
        expect.assertions(8)
        done()
      }
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
          tap(getGroupsForUser => expect(getGroupsForUser).toEqual([ 'site-2', 'site-5' ])),
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
          tap(getGroupsForUser => expect(getGroupsForUser).toEqual([ 'site-2', 'site-5' ])),
          mapTo(userIds)
        )
      })
    ).subscribe(
      () => {
        expect.assertions(12)
        done()
      }
    )
  })

  test('findRoles() - simple, with query, with cursor & paging', done => {
    createTestUsers$().pipe(
      // --- simple find
      concatMap(() => roleService.findRoles({
        project: { name: 1, _id: 0 }
      })),
      tap(roles => expect(roles).toMatchSnapshot()),
      // --- find with query (ends with)
      concatMap(() => roleService.findRoles({
        q: 'INs',
        project: { name: 1, _id: 0 }
      })),
      tap(roles => expect(roles).toMatchSnapshot()),
      // --- find with query (starts with)
      concatMap(() => roleService.findRoles({
        q: 'memb',
        project: { name: 1, _id: 0 }
      })),
      tap(roles => expect(roles).toMatchSnapshot()),
      // --- find with cursor
      concatMap(() => roleService.findRoles({
        limit: 3
      })),
      tap(roles => {
        // has cursor and three docs
        expect(roles.cursor).toBeTruthy()
        expect(roles.docs.length).toBe(3)
      }),
      concatMap(roles => {
        return roleService.findRoles({
          cursor: roles.cursor,
          limit: 2
        })
      }),
      tap(roles => {
        expect(roles.cursor).toBeTruthy()
        expect(roles.docs.length).toBe(2)
      }),
      concatMap(roles => roleService.findRoles({ cursor: roles.cursor })),
      tap(roles => {
        expect(roles.cursor).toBeFalsy()
        expect(roles.docs.length).toBe(0)
      })
    ).subscribe(
      () => {
        expect.assertions(16)
        done()
      }
    )
  })

  test('getRolesForUser()', done => {
    createTestUsers$().pipe(
      concatMap(userIds => forkJoin(
        // all user2 roles
        roleService.getRolesForUser({
          userId: userIds.user2
        }),
        // user2 global roles
        roleService.getRolesForUser({
          userId: userIds.user2,
          group: RoleService.GLOBAL
        }),
        // user2 site-2 roles
        roleService.getRolesForUser({
          userId: userIds.user2,
          group: 'site-2'
        }),
        // user2 site-5 roles
        roleService.getRolesForUser({
          userId: userIds.user2,
          group: 'site-5'
        })
      )),
      tap(roles => expect(roles).toMatchSnapshot())
    ).subscribe(() => {
      expect.assertions(8)
      done()
    })
  })

  test('getUsersInRoles()', done => {
    createTestUsers$().pipe(
      concatMap(() => forkJoin(
        // user-1, user-2, user-3, user-4, user-5
        roleService.getUsersInRoles({
          roles: [ 'members' ]
        }),
        // admin, superadmin, user-2
        roleService.getUsersInRoles({
          roles: [ 'admins' ]
        }),
        // user-2
        roleService.getUsersInRoles({
          roles: [ 'admins' ],
          group: 'site-2'
        }),
        // admin, superadmin, user-2
        roleService.getUsersInRoles({
          roles: [ 'admins' ],
          group: 'site-5'
        }),
        // empty - no cursor
        roleService.getUsersInRoles({
          roles: [ 'members' ],
          group: 'site-2'
        })
      )),
      tap(users => {
        expect(users[ 0 ].cursor!.length).toBeTruthy()
        expect(users[ 1 ].cursor!.length).toBeTruthy()
        expect(users[ 2 ].cursor!.length).toBeTruthy()
        expect(users[ 3 ].cursor!.length).toBeTruthy()

        expect(users[ 0 ].docs.map(user => omitVolatileUser(user))).toMatchSnapshot()
        expect(users[ 1 ].docs.map(user => omitVolatileUser(user))).toMatchSnapshot()
        expect(users[ 2 ].docs.map(user => omitVolatileUser(user))).toMatchSnapshot()
        expect(users[ 3 ].docs.map(user => omitVolatileUser(user))).toMatchSnapshot()

        // no cursor, no user
        expect(users[ 4 ]).toMatchSnapshot()
      })
    ).subscribe(() => {
      expect.assertions(16)
      done()
    })
  })

  test('getUsersInRoles() multiple roles', done => {
    createTestUsers$().pipe(
      concatMap(() => roleService.getUsersInRoles({
        roles: [ 'superadmins', 'admins' ],
        group: 'site-2'
      })),
      tap(users => {
        expect(users.docs.length).toBe(3)
        expect(users.docs.map(doc => omitVolatileUser(doc))).toMatchSnapshot()
      }),
      concatMap(() => roleService.getUsersInRoles({
        roles: [ 'superadmins', 'admins' ]
      })),
      tap(users => {
        expect(users.docs.length).toBe(4)
        expect(users.docs.map(doc => omitVolatileUser(doc))).toMatchSnapshot()
      })
    ).subscribe(() => {
      expect.assertions(11)
      done()
    })
  })

  test('getUsersInRoles() paging', done => {
    createTestUsers$().pipe(
      // user-1, user-2
      concatMap(() => roleService.getUsersInRoles({
        roles: [ 'members' ], limit: 2
      })),
      tap(users => {
        expect(users.cursor).toBeTruthy()
        expect(users.docs.length).toBe(2)
      }),
      // user-3, user-4
      concatMap(users => roleService.getUsersInRoles({
        roles: [ 'members' ], limit: 2,
        cursor: users.cursor
      })),
      tap(users => {
        expect(users.cursor).toBeTruthy()
        expect(users.docs.length).toBe(2)
      }),
      // user-5
      concatMap(users => roleService.getUsersInRoles({
        roles: [ 'members' ], limit: 2,
        cursor: users.cursor
      })),
      tap(users => {
        expect(users.cursor).toBeTruthy()
        expect(users.docs.length).toBe(1)
      }),
      // empty docs
      concatMap(users => roleService.getUsersInRoles({
        roles: [ 'members' ], limit: 2,
        cursor: users.cursor
      })),
      tap(users => {
        expect(users.cursor).toBeFalsy()
        expect(users.docs.length).toBe(0)
      })
    ).subscribe(() => {
      expect.assertions(15)
      done()
    })
  })

  test('removeUsersFromRoles()', done => {
    createTestUsers$().pipe(
      concatMap(users => roleService.removeUsersFromRoles({
        userIds: [ users.user1 ],
        roles: [ 'members' ]
      })),
      concatMap(() => roleService.getUsersInRoles({ roles: [ 'members' ] })),
      tap(val => {
        const names = val.docs.map(doc => doc.profile.displayName)
        expect(names).toEqual([ 'user-2', 'user-3', 'user-4', 'user-5' ])
      })
    ).subscribe(() => {
      expect.assertions(8)
      done()
    })
  })

  test('removeUsersFromRoles() - multiple roles', done => {
    createTestUsers$().pipe(
      concatMap(users => forkJoin(
        roleService.removeUsersFromRoles({
          userIds: [ users.user2 ],
          roles: [ 'members', 'superadmins' ]
        }),
        roleService.removeUsersFromRoles({
          userIds: [ users.user2 ],
          roles: [ 'admins' ]
        })
      ).pipe(mapTo(users))),
      concatMap(users => roleService.getRolesForUser({ userId: users.user2 })),
      tap(rolesForUser => expect(rolesForUser).toEqual([ 'users-two', 'users' ]))
    ).subscribe(() => {
      expect.assertions(8)
      done()
    })
  })

  test('removeUsersFromAllRoles()', done => {
    createTestUsers$().pipe(
      concatMap(users => forkJoin(
        roleService.removeUsersFromAllRoles({
          userIds: [ users.user2, users.user3 ]
        }),
        roleService.removeUsersFromAllRoles({
          userIds: [ users.admin ]
        })
      ).pipe(mapTo(users))),
      concatMap(users => roleService.getRolesForUser({ userId: users.user2 }).pipe(
        tap(rolesForUser => expect(rolesForUser.length).toBe(0)),
        mapTo(users)
      )),
      concatMap(users => roleService.getRolesForUser({ userId: users.user3 }).pipe(
        tap(rolesForUser => expect(rolesForUser.length).toBe(0)),
        mapTo(users)
      )),
      concatMap(users => roleService.getRolesForUser({ userId: users.admin }).pipe(
        tap(rolesForUser => expect(rolesForUser.length).toBe(0)),
        mapTo(users)
      )),
      concatMap(users => roleService.getRolesForUser({ userId: users.user1 }).pipe(
        tap(rolesForUser => expect(rolesForUser).toEqual([ 'members' ]))
      ))
    ).subscribe(() => {
      expect.assertions(11)
      done()
    })
  })

  test('isUserInRoles()', done => {
    createTestUsers$().pipe(
      concatMap(users => forkJoin([
        roleService.isUserInRoles({
          userId: users.user1,
          roles: [ 'members' ]
        }),
        roleService.isUserInRoles({
          userId: users.user1,
          roles: [ 'admins' ]
        }),
        roleService.isUserInRoles({
          userId: users.user1,
          roles: [ 'members', 'admins' ]
        }),
        roleService.isUserInRoles({
          userId: users.user2,
          roles: [ 'admins' ],
          group: 'site-2'
        }),
        roleService.isUserInRoles({
          userId: users.user5,
          roles: [ 'superadmins' ]
        }),
        roleService.isUserInRoles({
          userId: users.user5,
          roles: [ 'superadmins' ],
          group: 'site-2'
        }),
        roleService.isUserInRoles({
          userId: users.user2,
          roles: [ 'admins' ],
          group: 'site-2'
        })
      ]))
    ).subscribe(val => {
      expect(val).toEqual([ true, false, true, true, false, true, true ])
      expect.assertions(8)
      done()
    })
  })
})
