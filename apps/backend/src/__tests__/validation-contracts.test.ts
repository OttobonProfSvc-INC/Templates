import express, { Request, Response } from 'express';
import request from 'supertest';
import { z } from 'zod';
import { validate, RouteTemplateIdParamSchema } from '../middleware/validate';
import { errorHandler } from '../middleware/error-handler';
import { requestIdMiddleware } from '../middleware/request-id';
import { TemplateDocumentSchema, SaveCustomizationRequestSchema } from '@sbloom/contracts';

describe('Phase 4I-6: Validation & API Contract Boundary Tests', () => {
  const handlerSpy = jest.fn((_req: Request, res: Response) => {
    res.json({ success: true });
  });

  const testApp = express();
  testApp.use(requestIdMiddleware);
  testApp.use(express.json());

  // Test route exercising param UUID validation
  testApp.get(
    '/api/templates/:id',
    validate({ params: RouteTemplateIdParamSchema }),
    handlerSpy
  );

  // Test route exercising strict body & TemplateDocument validation
  testApp.put(
    '/api/customizations/:id',
    validate({
      params: RouteTemplateIdParamSchema,
      body: SaveCustomizationRequestSchema,
    }),
    handlerSpy
  );

  // Test route exercising enum validation
  const EnumTestSchema = z.object({
    role: z.enum(['ADMIN', 'CONTRIBUTOR']),
  }).strict();

  testApp.post(
    '/api/test/roles',
    validate({ body: EnumTestSchema }),
    handlerSpy
  );

  testApp.use(errorHandler);

  beforeEach(() => {
    handlerSpy.mockClear();
  });

  const validSampleDoc = {
    documentVersion: 1,
    canvas: {
      width: 1080,
      height: 1080,
      backgroundColor: '#ffffff',
    },
    elements: [],
  };

  it('1. Rejects invalid UUID in route params in database mode with 400 VALIDATION_ERROR', async () => {
    let isolatedApp: express.Express;
    const prev = process.env.USE_DATABASE_STORAGE;
    try {
      process.env.USE_DATABASE_STORAGE = 'true';
      jest.isolateModules(() => {
        const { validate: isolatedValidate, RouteTemplateIdParamSchema: isolatedSchema } = require('../middleware/validate');
        const { errorHandler: isolatedErrorHandler } = require('../middleware/error-handler');
        const { requestIdMiddleware: isolatedReqId } = require('../middleware/request-id');

        isolatedApp = express();
        isolatedApp.use(isolatedReqId);
        isolatedApp.use(express.json());
        isolatedApp.get('/api/templates/:id', isolatedValidate({ params: isolatedSchema }), handlerSpy);
        isolatedApp.use(isolatedErrorHandler);
      });

      const res = await request(isolatedApp!).get('/api/templates/invalid-uuid-123');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.requestId).toBeDefined();
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'params.id',
          }),
        ])
      );
      expect(handlerSpy).not.toHaveBeenCalled();
    } finally {
      if (prev !== undefined) process.env.USE_DATABASE_STORAGE = prev;
      else delete process.env.USE_DATABASE_STORAGE;
    }
  });

  it('2. Rejects malformed JSON body with 400 BAD_REQUEST', async () => {
    const validUuid = '11111111-2222-3333-4444-555555555555';
    const res = await request(testApp)
      .put(`/api/customizations/${validUuid}`)
      .send('not a json string')
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(handlerSpy).not.toHaveBeenCalled();
  });

  it('2b. Rejects empty body when document is required with 400 VALIDATION_ERROR', async () => {
    const validUuid = '11111111-2222-3333-4444-555555555555';
    const res = await request(testApp)
      .put(`/api/customizations/${validUuid}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(handlerSpy).not.toHaveBeenCalled();
  });

  it('3. Rejects unexpected extraneous body field (strict Zod rejection)', async () => {
    const validUuid = '11111111-2222-3333-4444-555555555555';
    const res = await request(testApp)
      .put(`/api/customizations/${validUuid}`)
      .send({
        document: validSampleDoc,
        unexpectedProperty: 'malicious-or-unexpected',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('Unrecognized key'),
        }),
      ])
    );
    expect(handlerSpy).not.toHaveBeenCalled();
  });

  it('4. Rejects invalid TemplateDocument (missing required canvas fields)', async () => {
    const validUuid = '11111111-2222-3333-4444-555555555555';
    const invalidDoc = {
      documentVersion: 1,
      canvas: {
        // missing width, height, backgroundColor
      },
      elements: [],
    };

    const res = await request(testApp)
      .put(`/api/customizations/${validUuid}`)
      .send({
        document: invalidDoc,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.length).toBeGreaterThan(0);
    expect(handlerSpy).not.toHaveBeenCalled();
  });

  it('5. Rejects invalid TemplateDocument (negative canvas dimensions)', async () => {
    const validUuid = '11111111-2222-3333-4444-555555555555';
    const invalidDoc = {
      documentVersion: 1,
      canvas: {
        width: -1080,
        height: 0,
        backgroundColor: '#ffffff',
      },
      elements: [],
    };

    const res = await request(testApp)
      .put(`/api/customizations/${validUuid}`)
      .send({
        document: invalidDoc,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(handlerSpy).not.toHaveBeenCalled();
  });

  it('6. Rejects invalid enum value with 400 VALIDATION_ERROR', async () => {
    const res = await request(testApp)
      .post('/api/test/roles')
      .send({ role: 'SUPERUSER' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'body.role',
        }),
      ])
    );
    expect(handlerSpy).not.toHaveBeenCalled();
  });

  it('7. Rejects missing required field with 400 VALIDATION_ERROR', async () => {
    const res = await request(testApp)
      .post('/api/test/roles')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'body.role',
        }),
      ])
    );
    expect(handlerSpy).not.toHaveBeenCalled();
  });

  it('8. Valid payload passes validation and successfully invokes downstream handler', async () => {
    const validUuid = '11111111-2222-3333-4444-555555555555';
    const res = await request(testApp)
      .put(`/api/customizations/${validUuid}`)
      .send({
        document: validSampleDoc,
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(handlerSpy).toHaveBeenCalledTimes(1);
  });
});
