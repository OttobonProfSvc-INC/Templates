import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'

export default function NotFound() {
  return (
    <div className="flex flex-col h-full py-12">
      <PageHeader 
        title="Page Not Found" 
        description="The page you are looking for does not exist." 
      />
      <EmptyState
        title="404 - Not Found"
        description="We couldn't find the page you requested. It may have been moved or deleted."
        actionLabel="Back to Library"
        icon={
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        }
      />
    </div>
  )
}
