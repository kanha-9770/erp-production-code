import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Upload, Download } from "lucide-react"
export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-6 py-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-foreground mb-4">Enterprise Data Migration Platform</h1>
            <p className="text-lg text-muted-foreground">
              Import and export your data with enterprise-grade validation, mapping, and error handling
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center mb-4">
                  <Upload className="w-6 h-6 text-blue-600" />
                </div>
                <CardTitle>Import Data</CardTitle>
                <CardDescription>
                  Upload CSV or XLSX files and map them to your modules with intelligent field matching
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/data-migration/import">
                  <Button className="w-full">Start Import</Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center mb-4">
                  <Download className="w-6 h-6 text-green-600" />
                </div>
                <CardTitle>Export Data</CardTitle>
                <CardDescription>
                  Export your module data with custom field selection and filtering options
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/data-migration/export">
                  <Button variant="outline" className="w-full bg-transparent">
                    Start Export
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
