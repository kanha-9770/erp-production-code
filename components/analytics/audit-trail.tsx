'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  changes: any;
  userEmail: string;
  userName: string;
  ipAddress?: string;
  timestamp: string;
  createdAt: string;
}

interface AuditTrailProps {
  data: AuditLogEntry[];
  isLoading?: boolean;
}

const actionColors: Record<string, string> = {
  CREATE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  UPDATE: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  DELETE: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  READ: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  LOGIN: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  LOGOUT: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
};

export function AuditTrail({ data, isLoading }: AuditTrailProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);
  const itemsPerPage = 10;

  const paginatedData = data.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage);
  const totalPages = Math.ceil(data.length / itemsPerPage);

  const getActionBadge = (action: string) => {
    const cleanAction = action.toUpperCase();
    return actionColors[cleanAction] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  };

  return (
    <>
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Audit Trail</CardTitle>
          <CardDescription>System activity and user actions log</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
                <p className="text-foreground/60">Loading audit logs...</p>
              </div>
            </div>
          ) : data.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <p className="text-foreground/60">No audit logs found</p>
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-foreground/10 hover:bg-transparent">
                      <TableHead className="font-semibold">Action</TableHead>
                      <TableHead className="font-semibold">Entity</TableHead>
                      <TableHead className="font-semibold">User</TableHead>
                      <TableHead className="font-semibold">IP Address</TableHead>
                      <TableHead className="font-semibold">Timestamp</TableHead>
                      <TableHead className="font-semibold">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedData.map((entry) => (
                      <TableRow key={entry.id} className="border-foreground/10 hover:bg-foreground/5">
                        <TableCell>
                          <Badge className={getActionBadge(entry.action)}>
                            {entry.action.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="font-medium">{entry.entityType}</div>
                          <div className="text-foreground/60 text-xs font-mono">{entry.entityId}</div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="font-medium">{entry.userName || entry.userEmail}</div>
                          <div className="text-foreground/60 text-xs">{entry.userEmail}</div>
                        </TableCell>
                        <TableCell className="text-sm font-mono text-foreground/60">
                          {entry.ipAddress || '-'}
                        </TableCell>
                        <TableCell className="text-sm text-foreground/60">
                          {entry.timestamp}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedEntry(entry)}
                            className="gap-1"
                          >
                            <Eye className="h-4 w-4" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-foreground/10">
                  <div className="text-sm text-foreground/60">
                    Page {currentPage + 1} of {totalPages} ({data.length} total)
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                      disabled={currentPage === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
                      disabled={currentPage === totalPages - 1}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {selectedEntry && (
        <Dialog open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Audit Log Details</DialogTitle>
              <DialogDescription>
                Event: {selectedEntry.action} on {selectedEntry.entityType}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-96 w-full rounded-md border p-4">
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Summary</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-foreground/60">Action:</span>
                      <p className="font-medium">{selectedEntry.action}</p>
                    </div>
                    <div>
                      <span className="text-foreground/60">Entity Type:</span>
                      <p className="font-medium">{selectedEntry.entityType}</p>
                    </div>
                    <div>
                      <span className="text-foreground/60">Entity ID:</span>
                      <p className="font-mono text-xs">{selectedEntry.entityId}</p>
                    </div>
                    <div>
                      <span className="text-foreground/60">User:</span>
                      <p className="font-medium">{selectedEntry.userName || selectedEntry.userEmail}</p>
                    </div>
                    <div>
                      <span className="text-foreground/60">IP Address:</span>
                      <p className="font-mono">{selectedEntry.ipAddress || '-'}</p>
                    </div>
                    <div>
                      <span className="text-foreground/60">Timestamp:</span>
                      <p className="font-medium">{selectedEntry.timestamp}</p>
                    </div>
                  </div>
                </div>

                {selectedEntry.changes && (
                  <div>
                    <h3 className="font-semibold mb-2">Changes</h3>
                    <pre className="bg-foreground/5 p-3 rounded-md overflow-x-auto text-xs">
                      {JSON.stringify(selectedEntry.changes, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
