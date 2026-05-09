"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { useCreateEmployeeMutation } from "@/lib/api/employees";
import { EmployeeForm } from "@/components/employee/employee-form";

export default function NewEmployeePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [createEmployee, { isLoading }] = useCreateEmployeeMutation();

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/employee-master" aria-label="Back to employees">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            New employee
          </h1>
          <p className="text-sm text-muted-foreground">
            Capture the basics now — bank, IDs and shift details can be filled
            in later from the employee profile.
          </p>
        </div>
      </div>

      <EmployeeForm
        submitLabel="Create employee"
        submitting={isLoading}
        onCancel={() => router.push("/employee-master")}
        onSubmit={async (payload) => {
          try {
            await createEmployee(payload).unwrap();
            toast({ title: "Employee created" });
            router.push("/employee-master");
          } catch (e: any) {
            toast({
              title: "Could not create employee",
              description:
                e?.data?.error || e?.message || "Server rejected the request",
              variant: "destructive",
            });
          }
        }}
      />
    </div>
  );
}
