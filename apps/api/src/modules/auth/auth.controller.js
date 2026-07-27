import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../common/db.js';
import {
  authMiddleware,
  clientMeta,
  publicUser,
  signToken,
} from '../../common/auth.js';
import { httpError } from '../../common/errors.js';
import { writeAudit } from '../orders/orders.domain.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const parsed = z
      .object({
        username: z.string().min(1),
        password: z.string().min(1),
        remember: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw httpError(400, 'Kullanıcı adı ve şifre gerekli');

    const user = await prisma.user.findUnique({
      where: { username: parsed.data.username.trim().toLowerCase() },
      include: { office: true },
    });
    if (!user || !user.active) throw httpError(401, 'Geçersiz giriş bilgileri');
    const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!ok) throw httpError(401, 'Geçersiz giriş bilgileri');

    const remember = parsed.data.remember !== false;
    await writeAudit(
      user.id,
      'auth.login',
      { username: user.username, remember },
      clientMeta(req)
    );
    res.json({
      token: signToken(user, { remember }),
      user: publicUser(user),
      expiresIn: remember ? '7d' : '1d',
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  res.json({ user: publicUser(req.user) });
});

export default router;
