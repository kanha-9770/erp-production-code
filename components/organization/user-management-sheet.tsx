// "use client";

// import {
//   Sheet,
//   SheetContent,
//   SheetHeader,
//   SheetTitle,
//   SheetDescription,
//   SheetClose,
// } from "@/components/ui/sheet";
// import { Button } from "@/components/ui/button";
// import { X } from "lucide-react";
// import UserManagement from "@/components/users/UserManagement"; 

// interface UserManagementSheetProps {
//   open: boolean;
//   onOpenChange: (open: boolean) => void;
// }

// export function UserManagementSheet({ open, onOpenChange }: UserManagementSheetProps) {
//   return (
//     <Sheet open={open} onOpenChange={onOpenChange}>
//       <SheetContent
//         side="right"
//         // ─── Wider + more modern responsive sizing ───
//         className="
//           w-full 
//           sm:max-w-[92vw] 
//           md:max-w-[88vw] 
//           lg:max-w-[84vw] 
//           xl:max-w-[80vw] 
//           2xl:max-w-7xl 
//           p-0 
//           border-l border-slate-200 
//           shadow-2xl
//           rounded-l-2xl
//         "
//       >
//         <div className="flex flex-col h-full bg-white">
//           {/* Header – cleaner and more spacious */}
//           <SheetHeader className="px-6 sm:px-8 py-5 border-b bg-slate-50/90 flex-shrink-0">
//             <div className="flex items-center justify-between">
//               <div>
//                 <SheetTitle className="text-2xl font-bold tracking-tight text-slate-900">
//                   User Management
//                 </SheetTitle>
//                 <SheetDescription className="text-base text-slate-600 mt-1.5">
//                   Create or manage the organization users
//                 </SheetDescription>
//               </div>

//               <SheetClose asChild>
//                 <Button 
//                   variant="ghost" 
//                   size="icon" 
//                   className="h-10 w-10 rounded-full hover:bg-slate-200"
//                 >
//                 </Button>
//               </SheetClose>
//             </div>
//           </SheetHeader>

//           {/* Main content area – more padding for better readability */}
//           <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-6 md:py-8 bg-white">
//             <div className="max-w-[1400px] mx-auto">
//               <UserManagement />
//             </div>
//           </div>
//         </div>
//       </SheetContent>
//     </Sheet>
//   );
// }

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
import UserManagement from "@/components/users/UserManagement"; 
import { cn } from "@/lib/utils";

interface UserManagementSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserManagementSheet({ open, onOpenChange }: UserManagementSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          // Responsive width progression – mobile full screen → gradually narrower on larger screens
          "w-full",
          "sm:max-w-[95vw]",
          "md:max-w-[90vw]",
          "lg:max-w-[86vw]",
          "xl:max-w-[82vw]",
          "2xl:max-w-6xl",           // reasonable max for very wide screens
          "p-0",
          "border-l border-slate-200/80",
          "shadow-2xl",
          "rounded-l-xl sm:rounded-l-2xl",
          "bg-gradient-to-b from-white to-slate-50/30",
          "transition-all duration-300 ease-in-out"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header – cleaner, more spacious, better mobile scaling */}
          <SheetHeader className="px-4 sm:px-6 md:px-8 py-4 sm:py-5 border-b bg-white/95 backdrop-blur-sm flex-shrink-0 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <SheetTitle className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                  User Management
                </SheetTitle>
                <SheetDescription className="text-sm sm:text-base text-slate-600 mt-1 leading-relaxed">
                  Create, edit or manage organization users and their permissions
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          {/* Main content area – responsive padding + max-width constraint */}
          <div className="flex-1 overflow-y-auto">
            <div className={cn(
              "px-4 sm:px-6 md:px-8",
              "py-6 sm:py-8 md:py-10",
              "mx-auto w-full",
              "max-w-screen-2xl" // prevents content from becoming too wide on ultra-wide monitors
            )}>
              <div className="min-h-full">
                <UserManagement />
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}