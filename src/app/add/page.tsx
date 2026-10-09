import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'

export default function AddAssetPage() {
  return (
    <div className="flex flex-col h-full space-y-6">
      <PageHeader 
        title="Add Asset" 
        description="Upload and configure a new template or creative asset."
      />
      
      <div className="mt-8 max-w-3xl mx-auto w-full">
        <EmptyState
          title="Upload Infrastructure Pending"
          description="The asset ingestion pipeline, cloud storage configuration, and approval workflows are scheduled for a future development phase."
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
          }
        />
      </div>
    </div>
  )
}
