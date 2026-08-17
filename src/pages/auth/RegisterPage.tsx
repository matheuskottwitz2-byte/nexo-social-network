import { zodResolver } from '@hookform/resolvers/zod'
import { AtSign, Eye, EyeOff, LockKeyhole, Mail, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { AuthShell } from '../../components/auth/AuthShell'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../contexts/AuthContext'
import { PROFILE_NAME_MAX_LENGTH, USERNAME_MAX_LENGTH } from '../../lib/constants'
import { getErrorMessage } from '../../utils/errors'

const schema = z.object({
  name: z.string().trim().min(2, 'Digite pelo menos 2 caracteres.').max(PROFILE_NAME_MAX_LENGTH, `Use no máximo ${PROFILE_NAME_MAX_LENGTH} caracteres.`),
  username: z.string().trim().toLowerCase().min(3, 'Use pelo menos 3 caracteres.').max(USERNAME_MAX_LENGTH, `Use no máximo ${USERNAME_MAX_LENGTH} caracteres.`).regex(/^[a-z0-9_]+$/, 'Use apenas letras minúsculas, números e _.'),
  email: z.string().trim().email('Digite um e-mail válido.'),
  password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.').max(72, 'A senha é muito longa.'),
})

type RegisterForm = z.infer<typeof schema>

export function RegisterPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterForm>({ resolver: zodResolver(schema) })

  async function onSubmit(values: RegisterForm) {
    try {
      const result = await signUp(values)
      if (result.needsEmailConfirmation) {
        toast.success('Conta criada! Confirme seu e-mail para entrar.', { duration: 6000 })
        navigate('/login', { replace: true })
      } else {
        toast.success('Sua conta está pronta!')
        navigate('/', { replace: true })
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Não foi possível criar sua conta.'))
    }
  }

  return (
    <AuthShell eyebrow="Comece agora" title="Crie seu espaço no Nexo" description="Leva menos de um minuto. Você poderá ajustar seu perfil depois.">
      <form className="auth-form two-column-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="field-group full-field">
          <label htmlFor="name">Nome</label>
          <div className="input-with-icon"><UserRound aria-hidden="true" /><input id="name" autoComplete="name" placeholder="Como quer ser chamado?" {...register('name')} /></div>
          {errors.name && <span className="field-error">{errors.name.message}</span>}
        </div>
        <div className="field-group full-field">
          <label htmlFor="username">Nome de usuário</label>
          <div className="input-with-icon"><AtSign aria-hidden="true" /><input id="username" autoComplete="username" placeholder="seu_username" {...register('username')} /></div>
          {errors.username && <span className="field-error">{errors.username.message}</span>}
        </div>
        <div className="field-group full-field">
          <label htmlFor="email">E-mail</label>
          <div className="input-with-icon"><Mail aria-hidden="true" /><input id="email" type="email" autoComplete="email" placeholder="voce@exemplo.com" {...register('email')} /></div>
          {errors.email && <span className="field-error">{errors.email.message}</span>}
        </div>
        <div className="field-group full-field">
          <label htmlFor="password">Senha</label>
          <div className="input-with-icon"><LockKeyhole aria-hidden="true" /><input id="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Mínimo de 8 caracteres" {...register('password')} /><button type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff /> : <Eye />}</button></div>
          {errors.password && <span className="field-error">{errors.password.message}</span>}
        </div>
        <Button type="submit" loading={isSubmitting} className="auth-submit full-field">Criar minha conta</Button>
      </form>
      <p className="auth-switch">Já faz parte? <Link to="/login">Entrar</Link></p>
    </AuthShell>
  )
}
