"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface LeaveRule {
  id: string;
  type: string;
  deductionPercent: number;
}

export function LeaveRulesManager() {
  const [rules, setRules] = useState<LeaveRule[]>([
    { id: "1", type: "Sick Leave", deductionPercent: 50 },
    { id: "2", type: "Casual Leave", deductionPercent: 100 },
  ]);

  const [newType, setNewType] = useState("");
  const [newPercent, setNewPercent] = useState("100");

  const handleAdd = () => {
    if (!newType) {
      toast.error("Please enter leave type");
      return;
    }
    setRules([
      ...rules,
      {
        id: Date.now().toString(),
        type: newType,
        deductionPercent: Number(newPercent),
      },
    ]);
    setNewType("");
    setNewPercent("100");
    toast.success("Rule added");
  };

  const handleDelete = (id: string) => {
    setRules(rules.filter((r) => r.id !== id));
    toast.success("Rule deleted");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Leave Rules</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center justify-between p-3 border rounded-lg"
            >
              <div>
                <p className="font-medium">{rule.type}</p>
                <p className="text-sm text-muted-foreground">
                  {rule.deductionPercent}% deduction
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(rule.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="space-y-3 pt-4 border-t">
          <div className="space-y-2">
            <Label>Leave Type</Label>
            <Input
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              placeholder="e.g., Annual Leave"
            />
          </div>
          <div className="space-y-2">
            <Label>Deduction %</Label>
            <Select value={newPercent} onValueChange={setNewPercent}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">0% (No deduction)</SelectItem>
                <SelectItem value="50">50% (Half day)</SelectItem>
                <SelectItem value="100">100% (Full day)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAdd} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add Rule
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
