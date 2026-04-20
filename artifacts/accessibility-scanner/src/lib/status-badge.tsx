import { Badge } from "@/components/ui/badge";
import { PlayCircle, CheckCircle2, XCircle, Clock } from "lucide-react";

export function getStatusBadge(status: string) {
  switch (status) {
    case "completed": return <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/20"><CheckCircle2 className="w-3 h-3 mr-1"/> Completed</Badge>;
    case "running": return <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-500/20"><PlayCircle className="w-3 h-3 mr-1"/> Running</Badge>;
    case "pending": return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 border-yellow-500/20"><Clock className="w-3 h-3 mr-1"/> Pending</Badge>;
    case "failed": return <Badge variant="outline" className="bg-red-500/10 text-red-700 border-red-500/20"><XCircle className="w-3 h-3 mr-1"/> Failed</Badge>;
    case "cancelled": return <Badge variant="outline" className="bg-gray-500/10 text-gray-700 border-gray-500/20">Cancelled</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}
