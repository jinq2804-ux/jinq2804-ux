import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/store.ts';
import { authRequired, signToken, safeUser, ah } from '../middleware/auth.ts';
import type { User } from '../types.ts';

const router = Router();

router.post('/register', ah(async (req, res) => {
  const { email, password, name, role } = (req.body || {}) as { email?: string; password?: string; name?: string; role?: string };
  const mail = (email || '').trim().toLowerCase();
  const pwd = password || '';
  const nm = (name || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return void res.status(400).json({ error: '请输入有效的邮箱地址' });
  if (pwd.length < 6) return void res.status(400).json({ error: '密码至少 6 位' });
  if (!nm) return void res.status(400).json({ error: '请输入姓名' });
  if (db.findOne('users', (u) => u.email === mail)) return void res.status(409).json({ error: '该邮箱已注册' });

  const wantAdmin = role === 'admin';
  const hasAdmin = db.data.users.some((u) => u.role === 'admin');
  if (wantAdmin && hasAdmin) return void res.status(403).json({ error: '管理员账号已存在' });

  const user: User = {
    id: db.newId(), email: mail, passwordHash: bcrypt.hashSync(pwd, 10),
    name: nm, role: wantAdmin ? 'admin' : 'teacher', createdAt: new Date().toISOString(),
  };
  db.insert('users', user);
  res.json({ token: signToken(user), user: safeUser(user) });
}));

router.post('/login', ah(async (req, res) => {
  const { email, password } = (req.body || {}) as { email?: string; password?: string };
  const mail = (email || '').trim().toLowerCase();
  const user = db.findOne('users', (u) => u.email === mail);
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
    return void res.status(401).json({ error: '邮箱或密码错误' });
  }
  res.json({ token: signToken(user), user: safeUser(user) });
}));

router.get('/me', authRequired, ah(async (req, res) => {
  const user = db.byId('users', req.user!.id);
  if (!user) return void res.status(404).json({ error: '用户不存在' });
  res.json({ user: safeUser(user) });
}));

export default router;
