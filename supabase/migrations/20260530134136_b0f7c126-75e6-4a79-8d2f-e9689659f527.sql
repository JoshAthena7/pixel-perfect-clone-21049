-- =====================================================
-- Edge case hardening: triggers, constraints, cascades
-- =====================================================

-- ---------- EDGE CASE 2: Prevent removing the last leader ----------
CREATE OR REPLACE FUNCTION public.prevent_last_leader_loss()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_engagement_id uuid;
  v_leader_count int;
  v_was_leader boolean;
  v_still_leader boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_engagement_id := OLD.engagement_id;
    v_was_leader := OLD.role IN ('founder','pm','engagement_lead');
    v_still_leader := false;
  ELSIF TG_OP = 'UPDATE' THEN
    v_engagement_id := OLD.engagement_id;
    v_was_leader := OLD.role IN ('founder','pm','engagement_lead');
    v_still_leader := NEW.role IN ('founder','pm','engagement_lead');
    -- Only worry if a leader is being demoted
    IF NOT v_was_leader OR v_still_leader THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NOT v_was_leader THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COUNT(*) INTO v_leader_count
  FROM public.engagement_members
  WHERE engagement_id = v_engagement_id
    AND role IN ('founder','pm','engagement_lead')
    AND id <> OLD.id;

  IF v_leader_count = 0 THEN
    RAISE EXCEPTION 'Cannot remove or demote the last leader on this engagement. Promote another member first.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_last_leader_loss ON public.engagement_members;
CREATE TRIGGER trg_prevent_last_leader_loss
BEFORE DELETE OR UPDATE OF role ON public.engagement_members
FOR EACH ROW EXECUTE FUNCTION public.prevent_last_leader_loss();


-- ---------- EDGE CASE 1: Cascade cleanup when a member is removed ----------
CREATE OR REPLACE FUNCTION public.cascade_member_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Unassign any sections owned by this member
  IF OLD.user_id IS NOT NULL THEN
    UPDATE public.section_assignments
    SET user_id = NULL,
        status = 'Not Started',
        updated_at = now()
    WHERE engagement_id = OLD.engagement_id
      AND user_id = OLD.user_id;

    -- Auto-resolve any open stuck flags from this member
    UPDATE public.stuck_flags
    SET resolved = true,
        resolved_at = now()
    WHERE engagement_id = OLD.engagement_id
      AND user_id = OLD.user_id
      AND resolved = false;

    -- Delete presence rows
    DELETE FROM public.presence
    WHERE engagement_id = OLD.engagement_id
      AND user_id = OLD.user_id;
  END IF;

  -- Mark unread nudges/quick_chats targeting this member as read
  UPDATE public.nudges
  SET read = true
  WHERE engagement_id = OLD.engagement_id
    AND recipient_id = OLD.id
    AND read = false;

  UPDATE public.quick_chats
  SET read = true
  WHERE engagement_id = OLD.engagement_id
    AND recipient_id = OLD.id
    AND read = false;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_member_removal ON public.engagement_members;
CREATE TRIGGER trg_cascade_member_removal
AFTER DELETE ON public.engagement_members
FOR EACH ROW EXECUTE FUNCTION public.cascade_member_removal();


-- ---------- EDGE CASE 7: Prevent duplicate active invites ----------
CREATE UNIQUE INDEX IF NOT EXISTS uq_engagement_invites_active
ON public.engagement_invites (engagement_id, lower(email))
WHERE revoked_at IS NULL AND accepted_at IS NULL;


-- ---------- Helper: count of open leaders (for UI checks) ----------
CREATE OR REPLACE FUNCTION public.leadership_count(_engagement_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.engagement_members
  WHERE engagement_id = _engagement_id
    AND role IN ('founder','pm','engagement_lead');
$$;

GRANT EXECUTE ON FUNCTION public.leadership_count(uuid) TO authenticated;