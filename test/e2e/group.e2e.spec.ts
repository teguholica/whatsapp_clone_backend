import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, createUser, cleanup, TestUser } from './setup';

describe('Group E2E', () => {
  let app: INestApplication;
  let owner: TestUser;
  let memberA: TestUser;
  let memberB: TestUser;
  let outsider: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    // app closed via --forceExit
  });

  beforeEach(async () => {
    await cleanup(app);
    owner = await createUser(app);
    memberA = await createUser(app);
    memberB = await createUser(app);
    outsider = await createUser(app);
  });

  function auth(token: string) {
    return (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  }

  async function createGroup(token: string, members?: string[]) {
    const m = members ?? [memberA.phone, memberB.phone];
    return auth(token)(
      request(app.getHttpServer())
        .post('/api/groups')
        .send({ name: 'Test Group', members: m }),
    ).expect(201);
  }

  describe('POST /api/groups', () => {
    it('creates a group with members', async () => {
      const res = await createGroup(owner.accessToken);

      expect(res.body.name).toBe('Test Group');
      expect(res.body.type).toBe('group');
      expect(res.body.members).toHaveLength(3);
      expect(res.body.admins).toEqual([owner.user.id]);
    });

    it('fails with invalid phone', async () => {
      await auth(owner.accessToken)(
        request(app.getHttpServer())
          .post('/api/groups')
          .send({ name: 'Bad', members: ['not-a-phone'] }),
      ).expect(400);
    });

    it('fails when creator includes own phone in members', async () => {
      await auth(owner.accessToken)(
        request(app.getHttpServer())
          .post('/api/groups')
          .send({ name: 'Self', members: [owner.phone] }),
      ).expect(400);
    });
  });

  describe('PUT /api/groups/:id', () => {
    it('updates group name as admin', async () => {
      const group = await createGroup(owner.accessToken);

      const res = await auth(owner.accessToken)(
        request(app.getHttpServer())
          .put(`/api/groups/${group.body.id}`)
          .send({ name: 'Updated' }),
      ).expect(200);

      expect(res.body.name).toBe('Updated');
    });

    it('returns 403 for non-admin', async () => {
      const group = await createGroup(owner.accessToken);

      await auth(memberA.accessToken)(
        request(app.getHttpServer())
          .put(`/api/groups/${group.body.id}`)
          .send({ name: 'Hack' }),
      ).expect(403);
    });
  });

  describe('POST /api/groups/:id/members', () => {
    it('adds members as admin', async () => {
      const group = await createGroup(owner.accessToken);
      const newUser = await createUser(app);

      const res = await auth(owner.accessToken)(
        request(app.getHttpServer())
          .post(`/api/groups/${group.body.id}/members`)
          .send({ members: [newUser.phone] }),
      ).expect(201);

      expect(res.body.members).toHaveLength(4);
    });

    it('returns 403 for non-admin', async () => {
      const group = await createGroup(owner.accessToken);
      const newUser = await createUser(app);

      await auth(memberA.accessToken)(
        request(app.getHttpServer())
          .post(`/api/groups/${group.body.id}/members`)
          .send({ members: [newUser.phone] }),
      ).expect(403);
    });
  });

  describe('DELETE /api/groups/:id/members/:userId', () => {
    it('removes member as admin', async () => {
      const group = await createGroup(owner.accessToken);
      const targetId = memberA.user.id;

      const res = await auth(owner.accessToken)(
        request(app.getHttpServer())
          .delete(`/api/groups/${group.body.id}/members/${targetId}`),
      ).expect(200);

      expect(res.body.members.find((m: any) => m.userId === targetId)).toBeUndefined();
    });

    it('returns 400 when removing self', async () => {
      const group = await createGroup(owner.accessToken);

      await auth(owner.accessToken)(
        request(app.getHttpServer())
          .delete(`/api/groups/${group.body.id}/members/${owner.user.id}`),
      ).expect(400);
    });

    it('returns 403 for non-admin', async () => {
      const group = await createGroup(owner.accessToken);

      await auth(memberA.accessToken)(
        request(app.getHttpServer())
          .delete(`/api/groups/${group.body.id}/members/${memberB.user.id}`),
      ).expect(403);
    });
  });

  describe('POST /api/groups/:id/admins', () => {
    it('promotes member to admin as super admin', async () => {
      const group = await createGroup(owner.accessToken);

      const res = await auth(owner.accessToken)(
        request(app.getHttpServer())
          .post(`/api/groups/${group.body.id}/admins`)
          .send({ userId: memberA.user.id }),
      ).expect(201);

      expect(res.body.admins).toContain(memberA.user.id);
    });

    it('returns 403 for non-admin', async () => {
      const group = await createGroup(owner.accessToken);

      await auth(memberA.accessToken)(
        request(app.getHttpServer())
          .post(`/api/groups/${group.body.id}/admins`)
          .send({ userId: memberB.user.id }),
      ).expect(403);
    });

    it('returns 403 when non-super-admin tries to promote', async () => {
      const group = await createGroup(owner.accessToken);

      await auth(owner.accessToken)(
        request(app.getHttpServer())
          .post(`/api/groups/${group.body.id}/admins`)
          .send({ userId: memberA.user.id }),
      ).expect(201);

      await auth(memberA.accessToken)(
        request(app.getHttpServer())
          .post(`/api/groups/${group.body.id}/admins`)
          .send({ userId: memberB.user.id }),
      ).expect(403);
    });
  });

  describe('DELETE /api/groups/:id/admins/:userId', () => {
    it('demotes admin as super admin', async () => {
      const group = await createGroup(owner.accessToken);
      await auth(owner.accessToken)(
        request(app.getHttpServer())
          .post(`/api/groups/${group.body.id}/admins`)
          .send({ userId: memberA.user.id }),
      ).expect(201);

      const res = await auth(owner.accessToken)(
        request(app.getHttpServer())
          .delete(`/api/groups/${group.body.id}/admins/${memberA.user.id}`),
      ).expect(200);

      expect(res.body.admins).not.toContain(memberA.user.id);
    });

    it('returns 400 when demoting self', async () => {
      const group = await createGroup(owner.accessToken);

      await auth(owner.accessToken)(
        request(app.getHttpServer())
          .delete(`/api/groups/${group.body.id}/admins/${owner.user.id}`),
      ).expect(400);
    });
  });
});
