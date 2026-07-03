import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useAuth() {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: listener } =
      supabase.auth.onAuthStateChange((_e, session) => {
        setUser(session?.user ?? null);
      });
    return () => listener.subscription.unsubscribe();
  }, []);

  const signUp  = (email, password) => supabase.auth.signUp({ email, password });
  const signIn  = (email, password) => supabase.auth.signInWithPassword({ email, password });
  const signOut = () => supabase.auth.signOut();

  return { user, loading, signUp, signIn, signOut };
}
