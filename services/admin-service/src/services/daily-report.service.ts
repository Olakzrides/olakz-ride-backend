import { supabase } from '../config/database';
import { logger } from '../utils/logger';
import { resolveAdminDisplayName } from './audit.service';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TaskItem {
  id:          string;
  description: string;
  category:    string;
  status:      'completed' | 'in_progress' | 'blocked';
}

export interface UpsertReportInput {
  reportDate:  string;        // YYYY-MM-DD
  department:  string;
  tasks:       TaskItem[];
  notes?:      string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function validateDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('report_date must be in YYYY-MM-DD format');
  }
}

function validateTasks(tasks: unknown): asserts tasks is TaskItem[] {
  if (!Array.isArray(tasks)) throw new Error('tasks must be an array');

  const validStatuses = ['completed', 'in_progress', 'blocked'];
  for (const t of tasks) {
    if (typeof t !== 'object' || t === null) throw new Error('Each task must be an object');
    const task = t as Record<string, unknown>;
    if (!task.id || typeof task.id !== 'string') throw new Error('Each task must have a string id');
    if (!task.description || typeof task.description !== 'string') throw new Error('Each task must have a description');
    if (!task.category || typeof task.category !== 'string') throw new Error('Each task must have a category');
    if (!task.status || !validStatuses.includes(task.status as string)) {
      throw new Error(`Each task status must be one of: ${validStatuses.join(', ')}`);
    }
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

export class DailyReportService {

  /**
   * Upsert today's (or a specified date's) report for the calling admin.
   * If a report already exists for (admin_id, report_date), it is updated.
   * admin_name is always resolved from the DB — never from client input.
   */
  static async upsertReport(adminId: string, input: UpsertReportInput) {
    validateDate(input.reportDate);
    if (!input.department?.trim()) throw new Error('department is required');
    validateTasks(input.tasks);

    // Resolve admin's display name from users table
    const { name: adminName } = await resolveAdminDisplayName(adminId);

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('admin_daily_reports')
      .upsert(
        {
          admin_id:     adminId,
          admin_name:   adminName,
          report_date:  input.reportDate,
          department:   input.department.trim(),
          tasks:        input.tasks,
          notes:        input.notes?.trim() ?? null,
          submitted_at: now,
          updated_at:   now,
        },
        { onConflict: 'admin_id,report_date' }
      )
      .select()
      .single();

    if (error) throw new Error(`Failed to save report: ${error.message}`);
    return data;
  }

  /**
   * Get paginated history of the calling admin's own reports, newest first.
   */
  static async getMyReports(adminId: string, page: number, limit: number) {
    const offset = (page - 1) * limit;

    const { data, count, error } = await supabase
      .from('admin_daily_reports')
      .select('*', { count: 'exact' })
      .eq('admin_id', adminId)
      .order('report_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to fetch reports: ${error.message}`);

    return {
      reports: data ?? [],
      pagination: {
        total: count ?? 0,
        page,
        limit,
        pages: Math.ceil((count ?? 0) / limit),
      },
    };
  }

  /**
   * Get the calling admin's report for today (or a specified date).
   * Returns null if no report has been submitted yet.
   */
  static async getMyReportForDate(adminId: string, date?: string) {
    const targetDate = date ?? new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('admin_daily_reports')
      .select('*')
      .eq('admin_id', adminId)
      .eq('report_date', targetDate)
      .maybeSingle();

    if (error) throw new Error(`Failed to fetch report: ${error.message}`);
    return data ?? null;
  }

  /**
   * Delete a report by ID.
   * Only the owning admin or super_admin may delete.
   */
  static async deleteReport(reportId: string, adminId: string, adminRoles: string[]) {
    const { data: existing, error: fetchErr } = await supabase
      .from('admin_daily_reports')
      .select('id, admin_id')
      .eq('id', reportId)
      .maybeSingle();

    if (fetchErr || !existing) throw new Error('Report not found');

    const isSuperAdmin = adminRoles.includes('super_admin');
    if (!isSuperAdmin && existing.admin_id !== adminId) {
      throw new Error('FORBIDDEN');
    }

    const { error } = await supabase
      .from('admin_daily_reports')
      .delete()
      .eq('id', reportId);

    if (error) throw new Error(`Failed to delete report: ${error.message}`);
  }

  /**
   * Get all staff reports for a given date (super_admin only).
   * Filterable by date and admin_name search.
   */
  static async getAllReports(params: {
    date?:       string;
    adminName?:  string;
    page:        number;
    limit:       number;
  }) {
    const targetDate = params.date ?? new Date().toISOString().split('T')[0];
    const { page, limit } = params;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('admin_daily_reports')
      .select('*', { count: 'exact' })
      .eq('report_date', targetDate)
      .order('submitted_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (params.adminName?.trim()) {
      query = query.ilike('admin_name', `%${params.adminName.trim()}%`);
    }

    const { data, count, error } = await query;
    if (error) throw new Error(`Failed to fetch all reports: ${error.message}`);

    return {
      reports: data ?? [],
      pagination: {
        total: count ?? 0,
        page,
        limit,
        pages: Math.ceil((count ?? 0) / limit),
      },
      summary: {
        total_submitted: count ?? 0,
        date: targetDate,
      },
    };
  }

  /**
   * Purge reports older than 6 months.
   * Called by the cleanup watchdog on service startup and every 24 hours.
   */
  static async purgeOldReports(): Promise<number> {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 6);
    const cutoffDate = cutoff.toISOString().split('T')[0]; // YYYY-MM-DD

    const { error, count } = await supabase
      .from('admin_daily_reports')
      .delete({ count: 'exact' })
      .lt('report_date', cutoffDate);

    if (error) {
      logger.error('purgeOldReports: failed', { error: error.message });
      return 0;
    }

    const deleted = count ?? 0;
    if (deleted > 0) {
      logger.info(`Daily report cleanup: deleted ${deleted} reports older than ${cutoffDate}`);
    }
    return deleted;
  }
}
