/**
 * lib/swagger.js
 * OpenAPI (Swagger) document and Express middleware setup.
 * Attach to an Express app with:
 *   const { attachSwagger } = require('./lib/swagger');
 *   attachSwagger(app);
 */

const swaggerUi = require('swagger-ui-express');

const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'DripFlow API Documentation',
    version: '1.0.0',
    description: 'Interactive API documentation for DripFlow cold email outreach CRM.',
  },
  servers: [{ url: '/', description: 'API Server' }],
  paths: {
    '/api/health': {
      get: { summary: 'Health Check', responses: { 200: { description: 'OK' } } },
    },
    '/api/start-campaign': {
      post: {
        summary: 'Start Background Campaign',
        description:
          'Creates a campaign document in Firestore and acquires a queue slot. ' +
          'Returns immediately — actual sending happens via server-side Cloud Function.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['contacts', 'stages', 'colMap'],
                properties: {
                  contacts: { type: 'array', description: 'Array of contact row objects' },
                  stages: { type: 'array', description: 'Array of stage objects' },
                  colMap: { type: 'object', description: 'Column mapping { name, email, company, role }' },
                  customTags: { type: 'array' },
                  delaySeconds: { type: 'number', example: 15 },
                  campaignName: { type: 'string' },
                  resumeBase64: { type: 'string' },
                  resumeFilename: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Campaign created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    campaignId: { type: 'string' },
                    queued: { type: 'boolean' },
                    queuePosition: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/stop-campaign': {
      post: { summary: 'Stop Campaign', description: 'Graceful stop (or immediate cancel if queued).' },
    },
    '/api/pause-campaign': {
      post: { summary: 'Pause Campaign', description: 'Pauses sending between contacts.' },
    },
    '/api/resume-campaign': {
      post: { summary: 'Resume Campaign', description: 'Resumes a paused campaign.' },
    },
    '/api/validate-credentials': {
      post: {
        summary: 'Validate SMTP Credentials',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['senderEmail', 'senderPassword'],
                properties: {
                  senderEmail: { type: 'string', example: 'user@gmail.com' },
                  senderPassword: { type: 'string', description: 'Gmail App Password' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Credentials valid' },
          401: { description: 'Authentication failed' },
        },
      },
    },
    '/api/send-email': {
      post: {
        summary: 'Send Single Email',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['senderEmail', 'senderPassword', 'recipientEmail', 'subject', 'body'],
                properties: {
                  senderEmail: { type: 'string' },
                  senderPassword: { type: 'string' },
                  recipientEmail: { type: 'string' },
                  recipientName: { type: 'string' },
                  subject: { type: 'string' },
                  body: { type: 'string' },
                  attachment: {
                    type: 'object',
                    properties: {
                      filename: { type: 'string' },
                      content: { type: 'string' },
                      contentType: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Email sent successfully' },
          500: { description: 'SMTP error' },
        },
      },
    },
  },
};

/**
 * Attaches the Swagger UI to the given Express app at `/api/docs`.
 * @param {import('express').Application} app
 */
function attachSwagger(app) {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
}

module.exports = { attachSwagger, swaggerDocument };
