import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { AuthShell } from '../../components/auth/AuthShell'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../contexts/AuthContext'
import { getErrorMessage } from '../../utils/errors'

const schema = z.object({
  email: z.string().trim().email('Digite um e-mail válido.'),
  password: z.string().min(1, 'Digite sua senha.'),
})

type LoginForm = z.infer<typeof schema>

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showPassword, setShowPassword] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({ resolver: zodResolver(schema) })

  async function onSubmit(values: LoginForm) {
    try {
      await signIn(values.email, values.password)
      toast.success('Que bom ter você de volta!')
      const destination = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/'
      navigate(destination, { replace: true })
    } catch (error) {
      toast.error(getErrorMessage(error, 'E-mail ou senha incorretos.'))
    }
  }

  return (
    <AuthShell eyebrow="Bem-vindo de volta" title="Entre na sua conta" description="Continue de onde parou e veja o que está acontecendo.">
      <form className="auth-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="field-group">
          <label htmlFor="email">E-mail</label>
          <div className="input-with-icon"><Mail aria-hidden="true" /><input id="email" type="email" autoComplete="email" placeholder="voce@exemplo.com" {...register('email')} /></div>
          {errors.email && <span className="field-error">{errors.email.message}</span>}
        </div>
        <div className="field-group">
          <label htmlFor="password">Senha</label>
          <div className="input-with-icon"><LockKeyhole aria-hidden="true" /><input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Sua senha" {...register('password')} /><button type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff /> : <Eye />}</button></div>
          {errors.password && <span className="field-error">{errors.password.message}</span>}
        </div>
        <Button type="submit" loading={isSubmitting} className="auth-submit">Entrar</Button>
      </form>
      <p className="auth-switch">Ainda não tem uma conta? <Link to="/register">Criar conta</Link></p>
    </AuthShell>
  )
}
