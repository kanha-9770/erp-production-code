"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import UserManagement from "@/components/UserManagement"; 

interface UserManagementSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserManagementSheet({ open, onOpenChange }: UserManagementSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        // ─── Wider + more modern responsive sizing ───
        className="
          w-full 
          sm:max-w-[92vw] 
          md:max-w-[88vw] 
          lg:max-w-[84vw] 
          xl:max-w-[80vw] 
          2xl:max-w-7xl 
          p-0 
          border-l border-slate-200 
          shadow-2xl
          rounded-l-2xl
        "
      >
        <div className="flex flex-col h-full bg-white">
          {/* Header – cleaner and more spacious */}
          <SheetHeader className="px-6 sm:px-8 py-5 border-b bg-slate-50/90 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle className="text-2xl font-bold tracking-tight text-slate-900">
                  User Management
                </SheetTitle>
                <SheetDescription className="text-base text-slate-600 mt-1.5">
                  Create or manage the organization users
                </SheetDescription>
              </div>

              <SheetClose asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-10 w-10 rounded-full hover:bg-slate-200"
                >
                </Button>
              </SheetClose>
            </div>
          </SheetHeader>

          {/* Main content area – more padding for better readability */}
          <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-6 md:py-8 bg-white">
            <div className="max-w-[1400px] mx-auto">
              <UserManagement />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}