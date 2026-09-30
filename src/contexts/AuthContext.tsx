import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Employee, Role } from '../types/database.types';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Employee | null;
  isLoading: boolean;
  isAdmin: boolean;
  isBoss: boolean;
  isEmployee: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = async (targetUser: User) => {
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('id', targetUser.id)
        .maybeSingle();

      if (!error && data) {
        setProfile(data as Employee);
        return;
      }

      // Auto-provision if missing
      const metaRole = (targetUser.user_metadata?.role as Role) || undefined;
      const metaFullName = targetUser.user_metadata?.full_name || targetUser.email?.split('@')[0] || 'User';

      const { count } = await supabase.from('employees').select('id', { count: 'exact', head: true });
      const isFirst = count === 0 || count === null;
      const assignedRole: Role = metaRole || (isFirst ? 'ADMIN' : 'EMPLOYEE');
      const prefix = assignedRole === 'ADMIN' ? 'MGR' : assignedRole === 'BOSS' ? 'BOSS' : 'EMP';
      const employeeId = `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;

      const newRecord = {
        id: targetUser.id,
        employee_id: employeeId,
        full_name: metaFullName,
        email: targetUser.email || '',
        position: assignedRole === 'BOSS' ? 'Executive / Boss' : assignedRole === 'ADMIN' ? 'Manager' : 'Team Member',
        role: assignedRole,
        joining_date: new Date().toISOString().split('T')[0],
        status: 'Active' as const,
      };

      const { data: inserted, error: insertError } = await supabase
        .from('employees')
        .upsert(newRecord, { onConflict: 'id' })
        .select('*')
        .maybeSingle();

      if (!insertError && inserted) {
        setProfile(inserted as Employee);
      } else {
        setProfile(newRecord as unknown as Employee);
      }
    } catch (e) {
      console.error('Profile fetch error:', e);
      if (targetUser) {
        setProfile({
          id: targetUser.id,
          employee_id: 'EMP-0001',
          full_name: targetUser.email?.split('@')[0] || 'User',
          email: targetUser.email || '',
          position: 'Team Member',
          role: 'EMPLOYEE',
          joining_date: new Date().toISOString().split('T')[0],
          status: 'Active',
          phone: null,
          profile_picture: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user).finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user).finally(() => setIsLoading(false));
      } else {
        setProfile(null);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    setProfile(null);
    await supabase.auth.signOut();
  };

  const role = profile?.role;
  const isAdmin = role === 'ADMIN';
  const isBoss = role === 'BOSS';
  const isEmployee = role === 'EMPLOYEE';

  return (
    <AuthContext.Provider value={{ session, user, profile, isLoading, isAdmin, isBoss, isEmployee, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
