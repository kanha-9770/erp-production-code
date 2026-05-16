"use client";

/**
 * Performance Module Hub — Premium Dashboard style.
 */

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  TrendingUp, Target, ArrowRight, Award, LineChart, 
  Users2, Sparkles, LayoutDashboard, ClipboardList
} from "lucide-react";

const modules = [
  {
    title: "KRA Tracking",
    description: "Define and monitor Key Result Areas with real-time progress metrics.",
    icon: Target,
    href: "/performance/kra",
    color: "from-blue-600 to-indigo-600",
    shadow: "shadow-blue-100",
  },
  {
    title: "Performance Appraisal",
    description: "Conduct comprehensive reviews with ratings and development feedback.",
    icon: Award,
    href: "/performance/appraisal",
    color: "from-emerald-600 to-teal-600",
    shadow: "shadow-emerald-100",
  },
];

export default function PerformanceHubPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <header className="mb-12 space-y-4">
          <div className="flex items-center gap-2 text-primary font-bold tracking-tight uppercase text-xs">
             <LineChart className="h-4 w-4" /> 
             Talent Management
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            Performance & Growth
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl leading-relaxed">
            Drive excellence through measurable goals and structured feedback cycles. 
            Manage KRAs and appraisals in a unified workspace.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {modules.map((module) => (
            <Link key={module.href} href={module.href} className="group">
              <Card className={`h-full border-0 shadow-xl ${module.shadow} overflow-hidden transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl`}>
                <div className={`h-2 bg-gradient-to-r ${module.color}`} />
                <CardContent className="p-8">
                  <div className="flex items-center justify-between mb-8">
                    <div className={`p-4 rounded-2xl bg-gradient-to-br ${module.color} text-white shadow-lg`}>
                      <module.icon className="h-8 w-8" />
                    </div>
                    <div className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition-all duration-300">
                       <ArrowRight className="h-5 w-5" />
                    </div>
                  </div>
                  
                  <h3 className="text-2xl font-black text-slate-900 mb-3 group-hover:text-primary transition-colors uppercase tracking-tighter">
                    {module.title}
                  </h3>
                  <p className="text-slate-600 leading-relaxed mb-8 text-sm font-medium">
                    {module.description}
                  </p>
                  
                  <div className="flex items-center text-[10px] font-black text-slate-400 group-hover:text-slate-900 transition-colors gap-3 tracking-[0.2em]">
                    ENTER WORKSPACE
                    <div className="h-px flex-1 bg-slate-100" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}

          {/* Large Analytics Card */}
          <Card className="md:col-span-2 border-0 shadow-2xl bg-slate-950 text-white overflow-hidden">
             <CardContent className="p-0 flex flex-col md:flex-row h-full">
                <div className="p-10 flex-1 space-y-6 relative z-10">
                   <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-[0.2em]">
                      <Sparkles className="h-3 w-3" /> Talent Insights
                   </div>
                   <h3 className="text-3xl font-black leading-tight uppercase tracking-tighter">
                      Strategic <br/>Performance Review
                   </h3>
                   <p className="text-slate-400 text-sm leading-relaxed max-w-md">
                      Our performance module connects individual objectives directly to organizational strategy. 
                      Track high-performers, identify skill gaps, and nurture talent in real-time.
                   </p>
                   <div className="flex gap-4 pt-4">
                      <div className="space-y-1">
                         <div className="text-2xl font-black">94%</div>
                         <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">KRA Alignment</div>
                      </div>
                      <div className="w-px bg-slate-800" />
                      <div className="space-y-1">
                         <div className="text-2xl font-black">12.5%</div>
                         <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Avg. Growth</div>
                      </div>
                   </div>
                </div>
                <div className="bg-slate-900/50 p-10 flex flex-col justify-center gap-4 min-w-[300px] border-l border-white/5">
                   <StatItem icon={ClipboardList} label="Active Reviews" value="48" />
                   <StatItem icon={Users2} label="Evaluated Staff" value="124" />
                   <Button className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold h-12 rounded-xl shadow-lg transition-all active:scale-95 border-0">
                      Generate Report
                   </Button>
                </div>
             </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatItem({ icon: Icon, label, value }: { icon: any, label: string, value: string }) {
   return (
      <div className="flex items-center gap-4">
         <div className="p-2.5 rounded-xl bg-slate-800 text-slate-400"><Icon className="h-4 w-4" /></div>
         <div>
            <div className="text-xl font-black leading-none">{value}</div>
            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">{label}</div>
         </div>
      </div>
   );
}
