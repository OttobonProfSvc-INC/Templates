import { TemplateService } from '../modules/templates/template.service';
import { CustomizationService } from '../modules/customizations/customization.service';
import { ReviewWorkflowService } from '../modules/reviews/review-workflow.service';
import { AssetLifecycleService } from '../modules/assets/asset-lifecycle.service';
import { NotFoundError, ForbiddenError, ConflictError } from '../common/errors';
import { TemplateDocument } from '@sbloom/contracts';

describe('Phase 4I-7, 4I-8, 4I-12, 4I-13: Services & Domain Lifecycle Tests', () => {
  const sampleDoc: TemplateDocument = {
    documentVersion: 1,
    canvas: { width: 1080, height: 1080, backgroundColor: '#ffffff' },
    elements: [
      {
        id: 'el-1',
        type: 'text',
        name: 'Heading',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        text: 'Hello',
        fontSize: 16,
        fontFamily: 'Inter',
        fontWeight: 'normal',
        color: '#000000',
        textAlign: 'left',
        zIndex: 0,
      },
    ],
  };

  // =========================================================================
  // 4I-7: Template Service Tests
  // =========================================================================
  describe('TemplateService (4I-7)', () => {
    let mockTemplateRepo: any;
    let service: TemplateService;

    beforeEach(() => {
      mockTemplateRepo = {
        findPublishedTemplates: jest.fn(),
        findPublishedTemplateById: jest.fn(),
      };
      service = new TemplateService(mockTemplateRepo);
    });

    it('listTemplates returns published masters only and excludes remixes', async () => {
      const mockMasters = [
        {
          id: 'tmpl-1',
          slug: 'coaching-post-01',
          status: 'PUBLISHED',
          remixSourceAssetId: null,
          createdAt: new Date('2026-01-01'),
          revisions: [{ id: 'rev-1', title: 'Coaching Post 1', metadata: sampleDoc, files: [] }],
        },
        {
          id: 'tmpl-2',
          slug: 'colleges-flyer-02',
          status: 'PUBLISHED',
          remixSourceAssetId: null,
          createdAt: new Date('2026-01-02'),
          revisions: [{ id: 'rev-2', title: 'College Flyer', metadata: sampleDoc, files: [] }],
        },
      ];

      mockTemplateRepo.findPublishedTemplates.mockResolvedValue(mockMasters);

      const result = await service.listTemplates();
      expect(result.some((r) => r.id === 'tmpl-1' && r.category === 'Coaching')).toBe(true);
      expect(result.some((r) => r.id === 'tmpl-2' && r.category === 'Colleges')).toBe(true);
    });

    it('listTemplates correctly applies category filter', async () => {
      const mockMasters = [
        {
          id: 'tmpl-1',
          slug: 'coaching-post-01',
          status: 'PUBLISHED',
          remixSourceAssetId: null,
          createdAt: new Date('2026-01-01'),
          revisions: [{ id: 'rev-1', title: 'Coaching Post', metadata: sampleDoc, files: [] }],
        },
        {
          id: 'tmpl-2',
          slug: 'schools-notice-01',
          status: 'PUBLISHED',
          remixSourceAssetId: null,
          createdAt: new Date('2026-01-02'),
          revisions: [{ id: 'rev-2', title: 'School Notice', metadata: sampleDoc, files: [] }],
        },
      ];
      mockTemplateRepo.findPublishedTemplates.mockResolvedValue(mockMasters);

      const coachingOnly = await service.listTemplates('coaching');
      expect(coachingOnly).toHaveLength(1);
      expect(coachingOnly[0].id).toBe('tmpl-1');
    });

    it('getTemplateById returns published master template', async () => {
      mockTemplateRepo.findPublishedTemplateById.mockResolvedValue({
        id: 'tmpl-1',
        slug: 'coaching-01',
        status: 'PUBLISHED',
        remixSourceAssetId: null,
        createdAt: new Date(),
        revisions: [{ id: 'rev-1', title: 'Master 1', metadata: sampleDoc, files: [] }],
      });

      const res = await service.getTemplateById('tmpl-1');
      expect(res).not.toBeNull();
      expect(res!.id).toBe('tmpl-1');
      expect(res!.title).toBe('Master 1');
    });

    it('getTemplateById returns null when template does not exist or is a private remix', async () => {
      mockTemplateRepo.findPublishedTemplateById.mockResolvedValue(null);

      const res = await service.getTemplateById('non-existent-or-remix');
      expect(res).toBeNull();
    });
  });

  // =========================================================================
  // 4I-8: Customization Service Tests
  // =========================================================================
  describe('CustomizationService (4I-8)', () => {
    let mockPrisma: any;
    let mockTemplateRepo: any;
    let mockCustomizationRepo: any;
    let service: CustomizationService;

    beforeEach(() => {
      mockPrisma = {
        $transaction: jest.fn(async (cb: any) => cb(mockPrisma)),
        asset: {
          findUnique: jest.fn(),
        },
      };
      mockTemplateRepo = {
        findBaseTemplateForRemix: jest.fn(),
      };
      mockCustomizationRepo = {
        createCustomizationWithRevision: jest.fn(),
        saveCustomizationRevision: jest.fn(),
        findCustomizationById: jest.fn(),
        allocateNextRevision: jest.fn(),
        logUsage: jest.fn(),
        deleteCustomization: jest.fn(),
      };

      service = new CustomizationService(mockPrisma, mockTemplateRepo, mockCustomizationRepo);
    });

    it('customizeTemplate deep clones source document ensuring source immutability', async () => {
      const originalSourceDoc: TemplateDocument = {
        documentVersion: 1,
        canvas: { width: 1080, height: 1080, backgroundColor: '#111111' },
        elements: [
          {
            id: 'el-1',
            type: 'text',
            name: 'Heading',
            x: 0,
            y: 0,
            width: 100,
            height: 50,
            text: 'Immutable Original',
            fontSize: 16,
            fontFamily: 'Inter',
            fontWeight: 'normal',
            color: '#000000',
            textAlign: 'left',
            zIndex: 0,
          },
        ],
      };

      mockTemplateRepo.findBaseTemplateForRemix.mockResolvedValue({
        id: 'base-tmpl-1',
        typeId: 'type-post',
        revisions: [{ id: 'base-rev-1', title: 'Base Master', metadata: originalSourceDoc }],
      });

      mockCustomizationRepo.createCustomizationWithRevision.mockImplementation(async (params: any) => {
        // Mutate the document received in the create call
        (params.metadata.elements[0] as any).text = 'Mutated in Remix';
        return {
          asset: { id: params.id, slug: params.slug, createdAt: new Date(), updatedAt: new Date() },
          revision: { id: 'rev-alloc-1', revisionNumber: 1, title: params.title },
        };
      });

      const res = await service.customizeTemplate('base-tmpl-1', { id: 'user-001', role: 'CONTRIBUTOR' });

      // Verify the returned customization has the new content
      expect((res.document.elements[0] as any).text).toBe('Mutated in Remix');
      // Crucial: The original source doc in memory must NOT have been mutated
      expect((originalSourceDoc.elements[0] as any).text).toBe('Immutable Original');
    });

    it('getCustomizationById permits owner and rejects non-owner with 403', async () => {
      mockCustomizationRepo.findCustomizationById.mockResolvedValue({
        id: 'cust-1',
        creatorId: 'user-owner',
        createdAt: new Date(),
        updatedAt: new Date(),
        revisions: [{ id: 'rev-1', revisionNumber: 1, metadata: sampleDoc }],
      });

      // Owner permitted
      const res = await service.getCustomizationById('cust-1', { id: 'user-owner', role: 'CONTRIBUTOR' });
      expect(res).not.toBeNull();
      expect(res!.id).toBe('cust-1');

      // Non-owner contributor rejected with 403
      await expect(
        service.getCustomizationById('cust-1', { id: 'user-other', role: 'CONTRIBUTOR' })
      ).rejects.toThrow(ForbiddenError);

      // Non-owner ADMIN rejected with 403 (Phase 4F private design privacy rule)
      await expect(
        service.getCustomizationById('cust-1', { id: 'admin-other', role: 'ADMIN' })
      ).rejects.toThrow(ForbiddenError);
    });

    it('saveCustomization permits owner and allocates next revision via gateway', async () => {
      mockCustomizationRepo.findCustomizationById.mockResolvedValue({
        id: 'cust-1',
        slug: 'design-cust-1',
        creatorId: 'user-owner',
        createdAt: new Date(),
        updatedAt: new Date(),
        revisions: [{ id: 'rev-1', revisionNumber: 1, title: 'Draft V1' }],
      });

      mockCustomizationRepo.saveCustomizationRevision.mockResolvedValue({
        asset: {
          id: 'cust-1',
          slug: 'design-cust-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        revision: {
          id: 'rev-2',
          revisionNumber: 2,
          title: 'Draft V2',
          status: 'DRAFT',
        },
      });

      const res = await service.saveCustomization(
        'cust-1',
        { id: 'user-owner', role: 'CONTRIBUTOR' },
        { title: 'Draft V2', document: sampleDoc }
      );

      expect(res.revisionNumber).toBe(2);
      expect(mockCustomizationRepo.saveCustomizationRevision).toHaveBeenCalledTimes(1);
    });

    it('saveCustomization rejects non-owner and non-owner ADMIN with 403', async () => {
      mockCustomizationRepo.findCustomizationById.mockResolvedValue({
        id: 'cust-1',
        creatorId: 'user-owner',
        revisions: [{ id: 'rev-1', revisionNumber: 1 }],
      });

      // Contributor non-owner
      await expect(
        service.saveCustomization('cust-1', { id: 'other-user', role: 'CONTRIBUTOR' }, { document: sampleDoc })
      ).rejects.toThrow(ForbiddenError);

      // Admin non-owner
      await expect(
        service.saveCustomization('cust-1', { id: 'admin-user', role: 'ADMIN' }, { document: sampleDoc })
      ).rejects.toThrow(ForbiddenError);
    });

    it('deleteCustomization checks ownership before database-mode blocked deletion', async () => {
      mockCustomizationRepo.findCustomizationById.mockResolvedValue({
        id: 'cust-1',
        creatorId: 'user-owner',
      });
      mockCustomizationRepo.deleteCustomization.mockRejectedValue(
        new ConflictError('Whole-asset deletion is blocked in database mode')
      );

      // 1. Non-owner must fail with ForbiddenError FIRST
      await expect(
        service.deleteCustomization('cust-1', { id: 'other-user', role: 'CONTRIBUTOR' })
      ).rejects.toThrow(ForbiddenError);

      // 2. Owner passes ownership check, but encounters database-mode blocked deletion ConflictError
      await expect(
        service.deleteCustomization('cust-1', { id: 'user-owner', role: 'CONTRIBUTOR' })
      ).rejects.toThrow(ConflictError);
    });
  });

  // =========================================================================
  // 4I-12: Review Workflow Service Tests
  // =========================================================================
  describe('ReviewWorkflowService (4I-12)', () => {
    let mockReviewRepo: any;
    let service: ReviewWorkflowService;

    beforeEach(() => {
      mockReviewRepo = {
        submitDraftRevision: jest.fn(),
        findRevisionById: jest.fn(),
        recordDecision: jest.fn(),
        findReviewsByRevisionId: jest.fn(),
      };
      service = new ReviewWorkflowService(mockReviewRepo);
    });

    it('submitDraftRevision permits CONTRIBUTOR and ADMIN', async () => {
      mockReviewRepo.submitDraftRevision.mockResolvedValue({
        revisionId: 'rev-1',
        status: 'SUBMITTED',
      });

      const res1 = await service.submitDraftRevision('rev-1', { id: 'contributor-1', role: 'CONTRIBUTOR' });
      expect(res1.status).toBe('SUBMITTED');

      const res2 = await service.submitDraftRevision('rev-1', { id: 'admin-1', role: 'ADMIN' });
      expect(res2.status).toBe('SUBMITTED');
    });

    it('recordDecision rejects non-admin with 403 FORBIDDEN', async () => {
      await expect(
        service.recordDecision(
          { revisionId: 'rev-1', decision: 'APPROVED' as any },
          { id: 'contributor-1', role: 'CONTRIBUTOR' }
        )
      ).rejects.toThrow('Only active administrators can record review decisions');
    });

    it('recordDecision rejects self-review (Peer Review Rule) by reading author from DB', async () => {
      // Author of the revision in the database is admin-1
      mockReviewRepo.findRevisionById.mockResolvedValue({
        id: 'rev-1',
        createdById: 'admin-1',
      });

      // admin-1 attempts to review their own submission
      await expect(
        service.recordDecision(
          { revisionId: 'rev-1', decision: 'APPROVED' as any },
          { id: 'admin-1', role: 'ADMIN' }
        )
      ).rejects.toThrow('Peer review violation: Author cannot review or decide their own submission');

      // Verify recordDecision routine was NOT called
      expect(mockReviewRepo.recordDecision).not.toHaveBeenCalled();
    });

    it('recordDecision allows ADMIN to review another contributor submission', async () => {
      mockReviewRepo.findRevisionById.mockResolvedValue({
        id: 'rev-1',
        createdById: 'contributor-1',
      });
      mockReviewRepo.recordDecision.mockResolvedValue({
        reviewId: 'review-1',
        decision: 'APPROVED',
        status: 'APPROVED',
      });

      const res = await service.recordDecision(
        { revisionId: 'rev-1', decision: 'APPROVED' as any, comments: 'LGTM' },
        { id: 'admin-1', role: 'ADMIN' }
      );

      expect(res.decision).toBe('APPROVED');
      expect(mockReviewRepo.recordDecision).toHaveBeenCalledWith({
        revisionId: 'rev-1',
        reviewerId: 'admin-1',
        decision: 'APPROVED',
        comments: 'LGTM',
      });
    });
  });

  // =========================================================================
  // 4I-13: Asset Lifecycle Service Tests
  // =========================================================================
  describe('AssetLifecycleService (4I-13)', () => {
    let mockAssetRepo: any;
    let service: AssetLifecycleService;

    beforeEach(() => {
      mockAssetRepo = {
        publishRevision: jest.fn(),
        archiveAsset: jest.fn(),
        unarchiveAsset: jest.fn(),
        deleteDraftRevision: jest.fn(),
      };
      service = new AssetLifecycleService(mockAssetRepo);
    });

    it('publishRevision rejects CONTRIBUTOR and permits ADMIN', async () => {
      await expect(
        service.publishRevision({ assetId: 'a-1', revisionId: 'r-1' }, { id: 'u-1', role: 'CONTRIBUTOR' })
      ).rejects.toThrow(ForbiddenError);

      mockAssetRepo.publishRevision.mockResolvedValue({
        assetId: 'a-1',
        publishedRevisionId: 'r-1',
        supersededRevisionId: null,
      });
      const res = await service.publishRevision({ assetId: 'a-1', revisionId: 'r-1' }, { id: 'admin-1', role: 'ADMIN' });
      expect(res.publishedRevisionId).toBe('r-1');
      expect(mockAssetRepo.publishRevision).toHaveBeenCalledWith({ assetId: 'a-1', revisionId: 'r-1' });
    });

    it('archiveAsset rejects CONTRIBUTOR and permits ADMIN', async () => {
      await expect(
        service.archiveAsset('a-1', { id: 'u-1', role: 'CONTRIBUTOR' })
      ).rejects.toThrow(ForbiddenError);

      mockAssetRepo.archiveAsset.mockResolvedValue({ assetId: 'a-1', status: 'ARCHIVED' });
      const res = await service.archiveAsset('a-1', { id: 'admin-1', role: 'ADMIN' });
      expect(res.status).toBe('ARCHIVED');
      expect(mockAssetRepo.archiveAsset).toHaveBeenCalledWith({ assetId: 'a-1', actorId: 'admin-1' });
    });

    it('unarchiveAsset rejects CONTRIBUTOR and permits ADMIN', async () => {
      await expect(
        service.unarchiveAsset('a-1', { id: 'u-1', role: 'CONTRIBUTOR' })
      ).rejects.toThrow(ForbiddenError);

      mockAssetRepo.unarchiveAsset.mockResolvedValue({ assetId: 'a-1', status: 'DRAFT' });
      const res = await service.unarchiveAsset('a-1', { id: 'admin-1', role: 'ADMIN' });
      expect(res.status).toBe('DRAFT');
      expect(mockAssetRepo.unarchiveAsset).toHaveBeenCalledWith({ assetId: 'a-1', actorId: 'admin-1' });
    });

    it('deleteDraftRevision validates role and forwards actorId to repository gateway', async () => {
      await expect(
        service.deleteDraftRevision('r-1', { id: 'u-1', role: 'INVALID_ROLE' as any })
      ).rejects.toThrow(ForbiddenError);

      mockAssetRepo.deleteDraftRevision.mockResolvedValue({ revisionId: 'r-1', status: 'DELETED' });
      const res = await service.deleteDraftRevision('r-1', { id: 'contributor-1', role: 'CONTRIBUTOR' });
      expect(res.status).toBe('DELETED');
      expect(mockAssetRepo.deleteDraftRevision).toHaveBeenCalledWith({ revisionId: 'r-1', actorId: 'contributor-1' });
    });
  });
});
