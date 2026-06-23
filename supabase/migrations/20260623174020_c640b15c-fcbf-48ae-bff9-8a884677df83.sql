UPDATE public.mission_documents
SET processing_status = 'error',
    processing_error = COALESCE(processing_error, 'Processing was interrupted (worker timed out). Click Retry to resume.'),
    processing_error_message = COALESCE(processing_error_message, 'Processing was interrupted (worker timed out). Click Retry to resume.')
WHERE processing_status LIKE 'processing_chunk_%'
  AND (updated_at IS NULL OR updated_at < now() - interval '10 minutes');