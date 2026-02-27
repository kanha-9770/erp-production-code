"use client"

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Eye, EyeOff, KeyRound, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { z } from 'zod'

const ResetPasswordSchema = z.object({
    otp: z.string().length(6, 'OTP must be 6 digits'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
})

type ResetPasswordFormData = z.infer<typeof ResetPasswordSchema>

interface ResetPasswordFormProps {
    userId?: string | null
}

export default function ResetPasswordForm({ userId }: ResetPasswordFormProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const router = useRouter()
    const { toast } = useToast()
    const inputRefs = useRef<(HTMLInputElement | null)[]>([])

    const form = useForm<ResetPasswordFormData>({
        resolver: zodResolver(ResetPasswordSchema),
        defaultValues: {
            otp: '',
            password: '',
            confirmPassword: '',
        },
    })

    const handleOTPChange = (index: number, value: string) => {
        if (value.length > 1) return

        const newOTP = form.getValues('otp').split('')
        newOTP[index] = value
        form.setValue('otp', newOTP.join(''))

        // Move to next input
        if (value && index < 5) {
            inputRefs.current[index + 1]?.focus()
        }
    }

    const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !e.currentTarget.value && index > 0) {
            inputRefs.current[index - 1]?.focus()
        }
    }

    const onSubmit = async (data: ResetPasswordFormData) => {
        if (!userId) {
            toast({
                title: 'Error',
                description: 'Invalid reset request',
                variant: 'destructive',
            })
            return
        }

        setIsLoading(true)

        try {
            const response = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...data,
                    userId,
                }),
            })

            const result = await response.json()

            if (!response.ok) {
                toast({
                    title: 'Reset Failed',
                    description: result.error || 'Invalid reset code',
                    variant: 'destructive',
                })
                return
            }

            toast({
                title: 'Success!',
                description: 'Password reset successfully. You are now logged in.',
            })

            // Force redirect to dashboard with replace and refresh
            window.location.href = '/profile'
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Network error. Please try again.',
                variant: 'destructive',
            })
        } finally {
            setIsLoading(false)
        }
    }

    const otpValue = form.watch('otp')

    if (!userId) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4">
                <Card className="w-full max-w-md">
                    <CardContent className="pt-6 text-center">
                        <p className="text-gray-600 mb-4">Invalid reset request</p>
                        <Link href="/forgot-password">
                            <Button>Request Password Reset</Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4">
            <div className="w-full max-w-md space-y-8">
                <div className="text-center">
                    <div className="mx-auto h-12 w-12 flex items-center justify-center bg-orange-600 rounded-full mb-4">
                        <KeyRound className="h-6 w-6 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                        Reset Password
                    </h1>
                    <p className="mt-2 text-gray-600">
                        Enter the code from your email and set a new password
                    </p>
                </div>

                <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
                    <CardHeader className="space-y-1">
                        <CardTitle className="text-2xl font-semibold">Set New Password</CardTitle>
                        <CardDescription>
                            Enter the 6-digit code and your new password
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                                <FormField
                                    control={form.control}
                                    name="otp"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-sm font-medium">Reset Code</FormLabel>
                                            <FormControl>
                                                <div className="flex justify-center space-x-3">
                                                    {[0, 1, 2, 3, 4, 5].map((index) => (
                                                        <Input
                                                            key={index}
                                                            ref={(el) => { inputRefs.current[index] = el }}
                                                            type="text"
                                                            maxLength={1}
                                                            className="w-12 h-12 text-center text-xl font-bold border-2 border-gray-200 focus:border-orange-500 focus:ring-orange-500"
                                                            value={otpValue[index] || ''}
                                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleOTPChange(index, e.target.value)}
                                                            onKeyDown={(e) => handleKeyDown(index, e)}
                                                            disabled={isLoading}
                                                        />
                                                    ))}
                                                </div>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="password"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-sm font-medium">New Password</FormLabel>
                                            <FormControl>
                                                <div className="relative">
                                                    <Input
                                                        {...field}
                                                        type={showPassword ? 'text' : 'password'}
                                                        placeholder="Enter new password"
                                                        className="pr-10 h-12 border-gray-200 focus:border-orange-500 focus:ring-orange-500"
                                                        disabled={isLoading}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowPassword(!showPassword)}
                                                        className="absolute right-3 top-3 h-4 w-4 text-gray-400 hover:text-gray-600"
                                                    >
                                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                    </button>
                                                </div>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="confirmPassword"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-sm font-medium">Confirm Password</FormLabel>
                                            <FormControl>
                                                <div className="relative">
                                                    <Input
                                                        {...field}
                                                        type={showConfirmPassword ? 'text' : 'password'}
                                                        placeholder="Confirm new password"
                                                        className="pr-10 h-12 border-gray-200 focus:border-orange-500 focus:ring-orange-500"
                                                        disabled={isLoading}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                                        className="absolute right-3 top-3 h-4 w-4 text-gray-400 hover:text-gray-600"
                                                    >
                                                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                    </button>
                                                </div>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <Button
                                    type="submit"
                                    className="w-full h-12 bg-orange-600 hover:bg-orange-700 text-white font-medium transition-all duration-200 hover:scale-[1.02]"
                                    disabled={isLoading || otpValue.length !== 6}
                                >
                                    {isLoading ? (
                                        <div className="flex items-center space-x-2">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            <span>Resetting password...</span>
                                        </div>
                                    ) : (
                                        'Reset Password'
                                    )}
                                </Button>
                            </form>
                        </Form>

                        <div className="mt-6 text-center">
                            <Link
                                href="/forgot-password"
                                className="inline-flex items-center space-x-1 text-sm text-gray-600 hover:text-gray-500 transition-colors"
                            >
                                <ArrowLeft className="h-3 w-3" />
                                <span>Back to forgot password</span>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}