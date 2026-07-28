import { Test, TestingModule } from '@nestjs/testing';
import { GroupController } from './group.controller';
import { GroupService } from './group.service';

describe('GroupController', () => {
  let ctrl: GroupController;
  let group: jest.Mocked<GroupService>;

  const mockUser = { id: 'u1', phone: '+6281' };
  const mockGroup = {
    id: 'grp-1',
    name: 'Test Group',
    type: 'group',
    members: [],
    admins: ['u1'],
    createdAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    const groupMock: jest.Mocked<Partial<GroupService>> = {
      create: jest.fn(),
      update: jest.fn(),
      addMembers: jest.fn(),
      removeMember: jest.fn(),
      promoteAdmin: jest.fn(),
      demoteAdmin: jest.fn(),
    };

    const mod: TestingModule = await Test.createTestingModule({
      controllers: [GroupController],
      providers: [{ provide: GroupService, useValue: groupMock }],
    }).compile();

    ctrl = mod.get(GroupController);
    group = mod.get(GroupService) as jest.Mocked<GroupService>;
  });

  describe('create', () => {
    it('delegates to group.create', async () => {
      const dto = { name: 'New Group', members: ['+6282'] };
      group.create.mockResolvedValue(mockGroup);

      const result = await ctrl.create(mockUser, dto);

      expect(group.create).toHaveBeenCalledWith('u1', dto);
      expect(result).toEqual(mockGroup);
    });
  });

  describe('update', () => {
    it('delegates to group.update', async () => {
      const dto = { name: 'Renamed' };
      group.update.mockResolvedValue(mockGroup);

      const result = await ctrl.update(mockUser, 'grp-1', dto);

      expect(group.update).toHaveBeenCalledWith('grp-1', 'u1', dto);
      expect(result).toEqual(mockGroup);
    });
  });

  describe('addMembers', () => {
    it('delegates to group.addMembers', async () => {
      const dto = { members: ['+6283'] };
      group.addMembers.mockResolvedValue(mockGroup);

      const result = await ctrl.addMembers(mockUser, 'grp-1', dto);

      expect(group.addMembers).toHaveBeenCalledWith('grp-1', 'u1', dto);
      expect(result).toEqual(mockGroup);
    });
  });

  describe('removeMember', () => {
    it('delegates to group.removeMember', async () => {
      group.removeMember.mockResolvedValue(mockGroup);

      const result = await ctrl.removeMember(mockUser, 'grp-1', 'u2');

      expect(group.removeMember).toHaveBeenCalledWith('grp-1', 'u1', 'u2');
      expect(result).toEqual(mockGroup);
    });
  });

  describe('promoteAdmin', () => {
    it('delegates to group.promoteAdmin', async () => {
      const dto = { userId: 'u2' };
      group.promoteAdmin.mockResolvedValue(mockGroup);

      const result = await ctrl.promoteAdmin(mockUser, 'grp-1', dto);

      expect(group.promoteAdmin).toHaveBeenCalledWith('grp-1', 'u1', dto);
      expect(result).toEqual(mockGroup);
    });
  });

  describe('demoteAdmin', () => {
    it('delegates to group.demoteAdmin', async () => {
      group.demoteAdmin.mockResolvedValue(mockGroup);

      const result = await ctrl.demoteAdmin(mockUser, 'grp-1', 'u2');

      expect(group.demoteAdmin).toHaveBeenCalledWith('grp-1', 'u1', { userId: 'u2' });
      expect(result).toEqual(mockGroup);
    });
  });
});
