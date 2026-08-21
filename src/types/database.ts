export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type Relationship = {
  foreignKeyName: string
  columns: string[]
  isOneToOne?: boolean
  referencedRelation: string
  referencedColumns: string[]
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; username: string; name: string; bio: string; avatar_url: string | null; cover_url: string | null; created_at: string; updated_at: string }
        Insert: { id: string; username: string; name: string; bio?: string; avatar_url?: string | null; cover_url?: string | null; created_at?: string; updated_at?: string }
        Update: { username?: string; name?: string; bio?: string; avatar_url?: string | null; cover_url?: string | null; updated_at?: string }
        Relationships: []
      }
      posts: {
        Row: { id: string; author_id: string; content: string; image_url: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; author_id: string; content: string; image_url?: string | null; created_at?: string; updated_at?: string }
        Update: { content?: string; image_url?: string | null; updated_at?: string }
        Relationships: [Relationship]
      }
      post_media: {
        Row: { id: string; post_id: string; owner_id: string; media_type: 'image'; storage_path: string; mime_type: string; width: number; height: number; position: number; alt_text: string | null; created_at: string }
        Insert: { id?: string; post_id: string; owner_id: string; media_type?: 'image'; storage_path: string; mime_type: string; width: number; height: number; position: number; alt_text?: string | null; created_at?: string }
        Update: never
        Relationships: [Relationship]
      }
      polls: {
        Row: { id: string; post_id: string; author_id: string; question: string; expires_at: string; created_at: string }
        Insert: { id?: string; post_id: string; author_id: string; question: string; expires_at: string; created_at?: string }
        Update: never
        Relationships: [Relationship]
      }
      poll_options: {
        Row: { id: string; poll_id: string; option_text: string; position: number; created_at: string }
        Insert: { id?: string; poll_id: string; option_text: string; position: number; created_at?: string }
        Update: never
        Relationships: [Relationship]
      }
      poll_votes: {
        Row: { poll_id: string; option_id: string; user_id: string; created_at: string }
        Insert: { poll_id: string; option_id: string; user_id: string; created_at?: string }
        Update: never
        Relationships: [Relationship, Relationship]
      }
      likes: {
        Row: { user_id: string; post_id: string; created_at: string }
        Insert: { user_id: string; post_id: string; created_at?: string }
        Update: never
        Relationships: [Relationship, Relationship]
      }
      comments: {
        Row: { id: string; post_id: string; author_id: string; content: string; created_at: string; updated_at: string }
        Insert: { id?: string; post_id: string; author_id: string; content: string; created_at?: string; updated_at?: string }
        Update: { content?: string; updated_at?: string }
        Relationships: [Relationship, Relationship]
      }
      follows: {
        Row: { follower_id: string; following_id: string; created_at: string }
        Insert: { follower_id: string; following_id: string; created_at?: string }
        Update: never
        Relationships: [Relationship, Relationship]
      }
    }
    Views: Record<string, never>
    Functions: {
      create_post_with_media: {
        Args: { p_post_id: string; p_content: string; p_media: Json; p_poll: Json }
        Returns: string
      }
      get_poll_summaries: {
        Args: { p_post_ids: string[] }
        Returns: { post_id: string; poll_id: string; question: string; expires_at: string; total_votes: number; viewer_option_id: string | null; options: Json }[]
      }
      get_dashboard_stats: {
        Args: Record<PropertyKey, never>
        Returns: { posts_count: number; likes_received: number; comments_received: number; followers_count: number; following_count: number; engagement_last_30_days: number }[]
      }
      get_posts_over_time: {
        Args: { days_back?: number }
        Returns: { day: string; posts: number }[]
      }
      vote_in_poll: {
        Args: { p_poll_id: string; p_option_id: string }
        Returns: string
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
