// Apply only the onboarding changes, preserving unrelated runtime changes.
function replaceOnce(text, before, after, name) {
  if (text.includes(after)) return text;
  if (text.split(before).length !== 2) throw new Error(`${name}入口不匹配，已停止部署。`);
  return text.replace(before, after);
}
function patchAuthService(text) {
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const before = [
    '    if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) {',
    '      throw authError("invalid_credentials", "当前密码不正确。", 401);',
    '    }',
    '    assertPasswordPolicy(input.newPassword, { currentPassword: input.currentPassword });',
  ].join(newline);
  const after = [
    '    if (!user) throw authError("unauthorized", "登录状态已失效，请重新登录。", 401);',
    '    // Only the persisted first-login flag permits changing a temporary password',
    '    // using the already authenticated session. Regular changes still verify it.',
    '    if ((!user.mustChangePassword || input.currentPassword) && !(await verifyPassword(input.currentPassword, user.passwordHash))) {',
    '      throw authError("invalid_credentials", "当前密码不正确。", 401);',
    '    }',
    '    assertPasswordPolicy(input.newPassword, { currentPassword: input.currentPassword });',
    '    if (await verifyPassword(input.newPassword, user.passwordHash)) {',
    '      throw authError("weak_password", "新密码不能与当前密码相同。", 400);',
    '    }',
  ].join(newline);
  return replaceOnce(text, before, after, '首次登录改密');
}
function patchDesktopShell(text) {
  return replaceOnce(text,
    '    if (user.mustChangePassword) setTimeout(() => { toast("首次登录请先修改临时密码"); el("#aiOsPasswordDialog")?.showModal(); }, 180);',
    '    // 首次改密由 Neon 工作台统一显示新密码和确认密码，避免叠加旧宿主弹窗。',
    'Neon 首次改密弹窗');
}
module.exports = { patchAuthService, patchDesktopShell };
