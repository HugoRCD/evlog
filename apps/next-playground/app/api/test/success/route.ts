import { withEvlog, useLogger } from '@/lib/evlog'

export const GET = withEvlog(async () => {
  const log = useLogger()

  log.set({
    user: {
      id: 'user_123',
      email: 'john.doe@company.com',
      plan: 'premium',
      team: 'engineering',
      permissions: ['read', 'write', 'admin'],
    },
    action: 'document_upload',
    source: 'web_app',
  })

  await new Promise(resolve => setTimeout(resolve, 200))
  log.set({
    processingStep: 'validation',
    file: {
      name: 'quarterly-report.pdf',
      size: 2457600,
      mimeType: 'application/pdf',
      hash: 'sha256:a1b2c3d4e5f6',
    },
  })

  await new Promise(resolve => setTimeout(resolve, 200))
  log.set({
    processingStep: 'virus_scan',
    security: {
      scanEngine: 'clamav',
      scanDuration: 145,
      threatsFound: 0,
      status: 'clean',
    },
  })

  await new Promise(resolve => setTimeout(resolve, 200))
  log.set({
    processingStep: 'storage',
    storage: {
      bucket: 'prod-documents',
      region: 'eu-west-1',
      path: '/uploads/2024/01/quarterly-report.pdf',
      encrypted: true,
      redundancy: 'multi-az',
    },
  })

  await new Promise(resolve => setTimeout(resolve, 100))
  log.set({
    processingStep: 'complete',
    metadata: {
      indexed: true,
      searchable: true,
      thumbnailGenerated: true,
      ocrProcessed: true,
      pageCount: 24,
    },
  })

  return Response.json({
    success: true,
    message: 'Document uploaded successfully',
    documentId: 'doc_abc123',
    timestamp: new Date().toISOString(),
  })
})
