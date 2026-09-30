/**
 * Database types for the LifeHub schema (supabase/migrations).
 *
 * Kept in the same shape as `supabase gen types typescript`. After changing migrations you
 * can regenerate against your cloud project with:
 *   npx supabase gen types typescript --project-id <project-ref> --schema public > src/types/database.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamps = { created_at: string; updated_at: string };

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13";
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          currency: string;
          timezone: string;
          email_reminders: boolean;
        } & Timestamps;
        Insert: {
          id: string;
          full_name?: string;
          currency?: string;
          timezone?: string;
          email_reminders?: boolean;
        };
        Update: {
          full_name?: string;
          currency?: string;
          timezone?: string;
          email_reminders?: boolean;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string;
          due_date: string | null;
          priority: Database["public"]["Enums"]["task_priority"];
          status: Database["public"]["Enums"]["task_status"];
          category: string;
          completed_at: string | null;
          search_text: string;
          kind: Database["public"]["Enums"]["task_kind"];
          repeat_days: number[] | null;
          starts_on: string | null;
          ends_on: string | null;
          reminder_time: string | null;
          paused_on: string | null;
        } & Timestamps;
        Insert: {
          title: string;
          description?: string;
          due_date?: string | null;
          priority?: Database["public"]["Enums"]["task_priority"];
          status?: Database["public"]["Enums"]["task_status"];
          category?: string;
          kind?: Database["public"]["Enums"]["task_kind"];
          repeat_days?: number[] | null;
          starts_on?: string | null;
          ends_on?: string | null;
          reminder_time?: string | null;
        };
        Update: {
          title?: string;
          description?: string;
          due_date?: string | null;
          priority?: Database["public"]["Enums"]["task_priority"];
          status?: Database["public"]["Enums"]["task_status"];
          category?: string;
          repeat_days?: number[] | null;
          starts_on?: string | null;
          ends_on?: string | null;
          reminder_time?: string | null;
          paused_on?: string | null;
        };
        Relationships: [];
      };
      task_completions: {
        Row: {
          id: string;
          user_id: string;
          task_id: string;
          occurred_on: string;
          completed_at: string;
        };
        Insert: {
          task_id: string;
          occurred_on: string;
        };
        Update: { [_ in never]: never };
        Relationships: [
          {
            foreignKeyName: "task_completions_task_fk";
            columns: ["task_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      bills: {
        Row: {
          id: string;
          user_id: string;
          kind: Database["public"]["Enums"]["bill_kind"];
          title: string;
          description: string;
          category: string;
          amount_minor: number | null;
          currency: string;
          recurrence: Database["public"]["Enums"]["recurrence_rule"];
          anchor_date: string;
          next_due_date: string;
          status: Database["public"]["Enums"]["bill_status"];
          search_text: string;
        } & Timestamps;
        Insert: {
          kind?: Database["public"]["Enums"]["bill_kind"];
          title: string;
          description?: string;
          category?: string;
          amount_minor?: number | null;
          currency?: string;
          recurrence?: Database["public"]["Enums"]["recurrence_rule"];
          anchor_date: string;
          next_due_date: string;
          status?: Database["public"]["Enums"]["bill_status"];
        };
        Update: {
          kind?: Database["public"]["Enums"]["bill_kind"];
          title?: string;
          description?: string;
          category?: string;
          amount_minor?: number | null;
          recurrence?: Database["public"]["Enums"]["recurrence_rule"];
          anchor_date?: string;
          next_due_date?: string;
          status?: Database["public"]["Enums"]["bill_status"];
        };
        Relationships: [];
      };
      bill_occurrences: {
        Row: {
          id: string;
          user_id: string;
          bill_id: string;
          due_date: string;
          amount_minor: number | null;
          currency: string;
          outcome: Database["public"]["Enums"]["bill_outcome"];
          completed_at: string;
          created_at: string;
        };
        Insert: {
          bill_id: string;
          due_date: string;
          amount_minor?: number | null;
          currency: string;
          outcome?: Database["public"]["Enums"]["bill_outcome"];
        };
        Update: { [_ in never]: never };
        Relationships: [
          {
            foreignKeyName: "bill_occurrences_bill_fk";
            columns: ["bill_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "bills";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          type: Database["public"]["Enums"]["transaction_type"];
          amount_minor: number;
          currency: string;
          description: string;
          category: string;
          payment_method: Database["public"]["Enums"]["payment_method"];
          occurred_on: string;
          search_text: string;
          bill_occurrence_id: string | null;
        } & Timestamps;
        Insert: {
          type: Database["public"]["Enums"]["transaction_type"];
          amount_minor: number;
          currency?: string;
          description: string;
          category: string;
          payment_method?: Database["public"]["Enums"]["payment_method"];
          occurred_on: string;
          bill_occurrence_id?: string | null;
        };
        Update: {
          type?: Database["public"]["Enums"]["transaction_type"];
          amount_minor?: number;
          description?: string;
          category?: string;
          payment_method?: Database["public"]["Enums"]["payment_method"];
          occurred_on?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_bill_occurrence_fk";
            columns: ["bill_occurrence_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "bill_occurrences";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      notes: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          content: string;
          pinned: boolean;
          search_text: string;
          excerpt: string;
        } & Timestamps;
        Insert: {
          title?: string;
          content?: string;
          pinned?: boolean;
        };
        Update: {
          title?: string;
          content?: string;
          pinned?: boolean;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          kind: Database["public"]["Enums"]["notification_kind"];
          title: string;
          body: string;
          link: string | null;
          source_type: "task" | "bill";
          source_id: string;
          due_date: string;
          dedupe_key: string;
          read_at: string | null;
          emailed_at: string | null;
          created_at: string;
        };
        Insert: { [_ in never]: never };
        Update: {
          read_at?: string | null;
          emailed_at?: string | null;
        };
        Relationships: [];
      };
      documents: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          storage_path: string;
          mime_type: string;
          size_bytes: number;
          status: Database["public"]["Enums"]["document_status"];
        } & Timestamps;
        Insert: {
          name: string;
          storage_path: string;
          mime_type: string;
          size_bytes: number;
        };
        Update: {
          name?: string;
          status?: Database["public"]["Enums"]["document_status"];
          size_bytes?: number;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      transaction_totals: {
        Args: { p_from: string; p_to: string };
        Returns: {
          currency: string;
          type: Database["public"]["Enums"]["transaction_type"];
          total_minor: number;
          tx_count: number;
        }[];
      };
      transaction_category_totals: {
        Args: {
          p_from: string;
          p_to: string;
          p_type: Database["public"]["Enums"]["transaction_type"];
          p_currency: string;
        };
        Returns: { category: string; total_minor: number; tx_count: number }[];
      };
      transaction_monthly_trend: {
        Args: { p_from: string; p_to: string; p_currency: string };
        Returns: { month: string; income_minor: number; expense_minor: number }[];
      };
      bill_summary: {
        Args: { p_today: string; p_until: string };
        Returns: {
          currency: string;
          overdue_count: number;
          overdue_total_minor: number;
          upcoming_count: number;
          upcoming_total_minor: number;
        }[];
      };
      mark_bill_occurrence: {
        Args: {
          p_bill_id: string;
          p_due_date: string;
          p_next_due_date?: string | null;
          p_outcome?: Database["public"]["Enums"]["bill_outcome"];
          p_amount_minor?: number | null;
          p_paid_on?: string | null;
          p_payment_method?: Database["public"]["Enums"]["payment_method"] | null;
          p_record_expense?: boolean;
        };
        Returns: string;
      };
      money_summary: {
        Args: { p_from: string; p_to: string };
        Returns: {
          currency: string;
          income_minor: number;
          bill_expense_minor: number;
          other_expense_minor: number;
          tx_count: number;
        }[];
      };
      undo_bill_occurrence: {
        Args: { p_bill_id: string; p_due_date: string; p_expected_next_due_date?: string | null };
        Returns: string;
      };
      sync_my_notifications: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      generate_all_notifications: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      delete_my_account: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
    };
    Enums: {
      task_priority: "low" | "medium" | "high";
      task_status: "pending" | "in_progress" | "completed";
      bill_kind: "bill" | "reminder";
      recurrence_rule: "none" | "daily" | "weekly" | "monthly" | "yearly";
      bill_status: "active" | "completed";
      transaction_type: "income" | "expense";
      payment_method: "cash" | "debit_card" | "credit_card" | "bank_transfer" | "e_wallet" | "other";
      document_status: "pending" | "ready";
      notification_kind: "due_soon" | "due_today" | "overdue";
      task_kind: "task" | "routine";
      bill_outcome: "done" | "skipped";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];

export type Profile = Tables<"profiles">;
export type Task = Tables<"tasks">;
export type TaskCompletion = Tables<"task_completions">;
export type Bill = Tables<"bills">;
export type BillOccurrence = Tables<"bill_occurrences">;
export type Transaction = Tables<"transactions">;
export type Note = Tables<"notes">;
export type AppNotification = Tables<"notifications">;
export type DocumentRecord = Tables<"documents">;
