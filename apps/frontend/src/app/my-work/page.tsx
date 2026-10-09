import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'

export default function MyWorkPage() {
  return (
    <div className="flex flex-col h-full space-y-6">
      <PageHeader 
        title="My Work" 
        description="Manage your drafts, submissions, and recently used templates."
      />
      
      <div className="mt-8">
        <EmptyState
          title="Coming Soon"
          description="The My Work dashboard is planned for a future phase once authentication and the database are established."
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><polyline points="12 6 12 12 16 14"/></svg>
          }
        />
      </div>
    </div>
  )
}
