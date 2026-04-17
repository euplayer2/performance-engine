import { supabase } from './supabase.js';

// ─── Helpers de mapeamento snake_case → camelCase ───
function rowToTask(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    priority: row.priority,
    duration: row.duration,
    recurring: row.recurring,
    date: row.date,
    completed: row.completed,
    timerStarted: row.timer_started,
    actualSeconds: row.actual_seconds,
    createdAt: row.created_at,
  };
}

function taskToRow(task) {
  const row = {};
  if (task.title !== undefined)         row.title          = task.title;
  if (task.category !== undefined)      row.category       = task.category;
  if (task.priority !== undefined)      row.priority       = task.priority;
  if (task.duration !== undefined)      row.duration       = task.duration;
  if (task.recurring !== undefined)     row.recurring      = task.recurring;
  if (task.date !== undefined)          row.date           = task.date;
  if (task.completed !== undefined)     row.completed      = task.completed;
  if (task.timerStarted !== undefined)  row.timer_started  = task.timerStarted;
  if (task.actualSeconds !== undefined) row.actual_seconds = task.actualSeconds;
  return row;
}

// ─── Preferências ───
export async function loadPrefs() {
  const { data, error } = await supabase
    .from('user_prefs')
    .select('available_time, theme, last_active_date')
    .maybeSingle();

  if (error) throw error;

  return data
    ? {
        availableTime: data.available_time,
        theme: data.theme,
        lastActiveDate: data.last_active_date,
      }
    : { availableTime: 480, theme: 'default', lastActiveDate: null };
}

export async function savePrefs(patch) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado');

  const row = {};
  if (patch.availableTime !== undefined) row.available_time   = patch.availableTime;
  if (patch.theme !== undefined)         row.theme            = patch.theme;
  if (patch.lastActiveDate !== undefined) row.last_active_date = patch.lastActiveDate;

  const { error } = await supabase
    .from('user_prefs')
    .upsert({ user_id: user.id, ...row }, { onConflict: 'user_id' });

  if (error) throw error;
}

// ─── Tarefas ───
export async function loadTasks() {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []).map(rowToTask);
}

export async function createTask(task) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado');

  const row = taskToRow(task);
  row.user_id = user.id;

  const { data, error } = await supabase
    .from('tasks')
    .insert(row)
    .select()
    .single();

  if (error) throw error;
  return rowToTask(data);
}

export async function updateTask(id, patch) {
  const { data, error } = await supabase
    .from('tasks')
    .update(taskToRow(patch))
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return rowToTask(data);
}

export async function deleteTask(id) {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
