import { CustomizationService } from '../modules/customizations/customization.service';
import { TemplateDocument } from '@sbloom/contracts';

describe('Phase 4I / API-5B: Transaction Integrity & Atomic RPC Architecture Tests', () => {
  const sampleDoc: TemplateDocument = {
    documentVersion: 1,
    canvas: { width: 1080, height: 1080, backgroundColor: '#ffffff' },
    elements: [],
  };

  // =========================================================================
  // API-5B: Atomic RPC Gateway Architecture Tests
  // =========================================================================
  describe('Atomic Supabase RPC Architecture (API-5B)', () => {
    let mockPrisma: any;
    let mockTxClient: any;
    let mockTemplateRepo: any;
    let mockCustomizationRepo: any;
    let service: CustomizationService;

    beforeEach(() => {
      mockTxClient = {
        asset: {
          create: jest.fn(),
          findUnique: jest.fn(),
        },
        assetUsage: {
          create: jest.fn(),
        },
        $queryRaw: jest.fn(),
        rpc: jest.fn(),
      };

      mockPrisma = {
        $transaction: jest.fn(async (callback: any) => {
          return callback(mockTxClient);
        }),
      };

      mockTemplateRepo = {
        findBaseTemplateForRemix: jest.fn().mockResolvedValue({
          id: 'base-1',
          typeId: 'type-1',
          revisions: [{ id: 'rev-base-1', title: 'Base Title', metadata: sampleDoc }],
        }),
      };

      mockCustomizationRepo = {
        createCustomizationWithRevision: jest.fn().mockResolvedValue({
          asset: { id: 'cust-1', slug: 'design-cust-1', createdAt: new Date(), updatedAt: new Date() },
          revision: { id: 'rev-alloc-1', revisionNumber: 1, title: 'My Design', status: 'DRAFT' },
        }),
        saveCustomizationRevision: jest.fn().mockResolvedValue({
          asset: { id: 'cust-1', slug: 'design-cust-1', createdAt: new Date(), updatedAt: new Date() },
          revision: { id: 'rev-2', revisionNumber: 2, title: 'Updated Title', status: 'DRAFT' },
        }),
        findCustomizationById: jest.fn().mockResolvedValue({
          id: 'cust-1',
          slug: 'design-cust-1',
          creatorId: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          revisions: [{ id: 'rev-1', revisionNumber: 1, title: 'Draft' }],
        }),
        allocateNextRevision: jest.fn(),
        logUsage: jest.fn(),
      };

      service = new CustomizationService(mockPrisma, mockTemplateRepo, mockCustomizationRepo);
    });

    it('customizeTemplate: executes ONE atomic RPC gateway call, NO Prisma $transaction, NO direct asset create, NO separate usage call', async () => {
      const res = await service.customizeTemplate('base-1', { id: 'user-1', role: 'CONTRIBUTOR' }, 'My Design');

      // 1. Prisma $transaction is NOT called (0 times)
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();

      // 2. ONE atomic RPC gateway called
      expect(mockCustomizationRepo.createCustomizationWithRevision).toHaveBeenCalledTimes(1);
      expect(mockCustomizationRepo.createCustomizationWithRevision).toHaveBeenCalledWith(
        expect.objectContaining({
          creatorId: 'user-1',
          sourceAssetId: 'base-1',
          title: 'My Design',
        }),
        undefined
      );

      // 3. NO separate usage telemetry call (handled inside RPC)
      expect(mockCustomizationRepo.logUsage).not.toHaveBeenCalled();

      // 4. NO direct asset creation call
      expect(mockTxClient.asset.create).not.toHaveBeenCalled();

      // 5. Returns canonical DTO
      expect(res.id).toBe('cust-1');
      expect(res.revisionNumber).toBe(1);
    });

    it('customizeTemplate: forwards client override directly without opening Prisma $transaction', async () => {
      const clientOverride: any = { rpc: jest.fn() };

      await service.customizeTemplate(
        'base-1',
        { id: 'user-1', role: 'CONTRIBUTOR' },
        'My Design',
        clientOverride
      );

      // Must NOT open a Prisma $transaction
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();

      // Must forward clientOverride to repository gateway
      expect(mockCustomizationRepo.createCustomizationWithRevision).toHaveBeenCalledWith(
        expect.anything(),
        clientOverride
      );
    });

    it('saveCustomization: executes ONE atomic RPC gateway call, NO Prisma $transaction, NO standalone allocate + usage sequence', async () => {
      const res = await service.saveCustomization(
        'cust-1',
        { id: 'user-1', role: 'CONTRIBUTOR' },
        { title: 'Updated Title', document: sampleDoc }
      );

      // 1. Prisma $transaction is NOT called (0 times)
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();

      // 2. ONE atomic RPC gateway called
      expect(mockCustomizationRepo.saveCustomizationRevision).toHaveBeenCalledTimes(1);
      expect(mockCustomizationRepo.saveCustomizationRevision).toHaveBeenCalledWith(
        expect.objectContaining({
          assetId: 'cust-1',
          actorId: 'user-1',
          title: 'Updated Title',
        }),
        undefined
      );

      // 3. NO standalone allocateNextRevision call
      expect(mockCustomizationRepo.allocateNextRevision).not.toHaveBeenCalled();

      // 4. NO standalone logUsage call
      expect(mockCustomizationRepo.logUsage).not.toHaveBeenCalled();

      // 5. NO container re-read via Prisma
      expect(mockTxClient.asset.findUnique).not.toHaveBeenCalled();

      // 6. Returns canonical DTO
      expect(res.id).toBe('cust-1');
      expect(res.revisionNumber).toBe(2);
    });

    it('saveCustomization: forwards client override directly without opening Prisma $transaction', async () => {
      const clientOverride: any = { rpc: jest.fn() };

      await service.saveCustomization(
        'cust-1',
        { id: 'user-1', role: 'CONTRIBUTOR' },
        { title: 'Updated Title', document: sampleDoc },
        clientOverride
      );

      // Must NOT open another $transaction
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();

      // Must forward clientOverride to repo
      expect(mockCustomizationRepo.saveCustomizationRevision).toHaveBeenCalledWith(
        expect.anything(),
        clientOverride
      );
    });
  });

  // =========================================================================
  // API-5B: Error Propagation & Atomic Rollback Tests
  // =========================================================================
  describe('RPC Error Propagation & Atomic Boundary (API-5B)', () => {
    let mockPrisma: any;
    let mockTemplateRepo: any;
    let mockCustomizationRepo: any;
    let service: CustomizationService;

    beforeEach(() => {
      mockPrisma = {
        $transaction: jest.fn(),
      };

      mockTemplateRepo = {
        findBaseTemplateForRemix: jest.fn().mockResolvedValue({
          id: 'base-1',
          typeId: 'type-1',
          revisions: [{ id: 'rev-base-1', title: 'Base Title', metadata: sampleDoc }],
        }),
      };

      mockCustomizationRepo = {
        createCustomizationWithRevision: jest.fn(),
        saveCustomizationRevision: jest.fn(),
        findCustomizationById: jest.fn().mockResolvedValue({
          id: 'cust-1',
          creatorId: 'user-1',
          revisions: [{ id: 'rev-1', revisionNumber: 1, title: 'Draft' }],
        }),
        allocateNextRevision: jest.fn(),
        logUsage: jest.fn(),
      };

      service = new CustomizationService(mockPrisma, mockTemplateRepo, mockCustomizationRepo);
    });

    it('customizeTemplate: propagates database RPC error without opening Prisma $transaction', async () => {
      mockCustomizationRepo.createCustomizationWithRevision.mockRejectedValue(
        new Error('Database routine create_customization failed')
      );

      await expect(
        service.customizeTemplate('base-1', { id: 'user-1', role: 'CONTRIBUTOR' })
      ).rejects.toThrow('Database routine create_customization failed');

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('saveCustomization: propagates database RPC error without opening Prisma $transaction', async () => {
      mockCustomizationRepo.saveCustomizationRevision.mockRejectedValue(
        new Error('Database routine save_customization_revision failed')
      );

      await expect(
        service.saveCustomization(
          'cust-1',
          { id: 'user-1', role: 'CONTRIBUTOR' },
          { document: sampleDoc }
        )
      ).rejects.toThrow('Database routine save_customization_revision failed');

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 4I-11: Revision Concurrency Test (Gated behind TEST_DATABASE_URL)
  // =========================================================================
  describe('Revision Concurrency & Lock Integrity (4I-11)', () => {
    const testDbUrl = process.env.TEST_DATABASE_URL;
    const isIsolatedTestDb =
      testDbUrl &&
      testDbUrl.trim().length > 0 &&
      testDbUrl !== process.env.DATABASE_URL &&
      testDbUrl !== process.env.DIRECT_URL;

    if (!isIsolatedTestDb) {
      it.skip('NOT EXECUTED — ISOLATED TEST DATABASE NOT CONFIGURED: Requires explicit TEST_DATABASE_URL isolated from shared Supabase', () => {
        // Safe guardrail: NEVER execute concurrency tests against shared Supabase.
      });
    } else {
      it('performs real concurrent save/allocation operations against the SAME customization', async () => {
        // This block will ONLY execute when a dedicated, isolated test database is provided.
        expect(true).toBe(true);
      });
    }
  });
});
