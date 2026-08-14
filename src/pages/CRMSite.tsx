import { CRMHeader } from "@/components/crm/CRMHeader";
import { KanbanBoard } from "@/components/crm/KanbanBoard";

export default function CRMSite() {
  return (
    <div className="p-4 md:p-6 space-y-5">
      <CRMHeader board="site" />
      <KanbanBoard board="site" allowCreate={false} />
    </div>
  );
}
