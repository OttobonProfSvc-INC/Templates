import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'

export default function LibraryPage() {
  return (
    <div className="flex flex-col h-full space-y-6">
      <PageHeader 
        title="Template Library" 
        description="Discover, preview, and reuse creative assets for your next project."
        action={
          <Link href="/add">
            <Button>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
              Add Asset
            </Button>
          </Link>
        }
      />
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-1 space-y-4 hidden md:block">
           <div className="bg-slate-50 border border-border rounded-lg p-4 h-[400px] flex items-center justify-center">
             <span className="text-sm text-slate-500">Filter Placeholder</span>
           </div>
        </div>
        
        <div className="md:col-span-3">
          <EmptyState
            title="Library Foundation Ready"
            description="The frontend architecture has been established. Asset ingestion and database connections are planned for future phases. The existing 28 templates will be migrated later."
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
            }
          />
        </div>
      </div>
    </div>
  )
}
