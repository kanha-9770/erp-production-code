-- Add hierarchical fields to form_modules table
ALTER TABLE form_modules 
ADD COLUMN IF NOT EXISTS parent_id TEXT,
ADD COLUMN IF NOT EXISTS module_type TEXT DEFAULT 'standard',
ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS path TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Add foreign key constraint for parent-child relationship
ALTER TABLE form_modules 
ADD CONSTRAINT fk_form_modules_parent 
FOREIGN KEY (parent_id) REFERENCES form_modules(id) ON DELETE SET NULL;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_form_modules_parent_id ON form_modules(parent_id);
CREATE INDEX IF NOT EXISTS idx_form_modules_level ON form_modules(level);
CREATE INDEX IF NOT EXISTS idx_form_modules_sort_order ON form_modules(sort_order);
CREATE INDEX IF NOT EXISTS idx_form_modules_module_type ON form_modules(module_type);

-- Update existing modules to have proper paths
UPDATE form_modules 
SET path = '/' || LOWER(REPLACE(name, ' ', '-'))
WHERE path IS NULL;

-- Function to calculate module path
CREATE OR REPLACE FUNCTION calculate_module_path(module_id TEXT)
RETURNS TEXT AS $$
DECLARE
    module_record RECORD;
    parent_path TEXT;
BEGIN
    SELECT * INTO module_record FROM form_modules WHERE id = module_id;
    
    IF module_record.parent_id IS NULL THEN
        RETURN '/' || LOWER(REPLACE(module_record.name, ' ', '-'));
    ELSE
        SELECT path INTO parent_path FROM form_modules WHERE id = module_record.parent_id;
        RETURN parent_path || '/' || LOWER(REPLACE(module_record.name, ' ', '-'));
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to update module hierarchy
CREATE OR REPLACE FUNCTION update_module_hierarchy()
RETURNS TRIGGER AS $$
BEGIN
    -- Update level based on parent
    IF NEW.parent_id IS NULL THEN
        NEW.level := 0;
    ELSE
        SELECT level + 1 INTO NEW.level FROM form_modules WHERE id = NEW.parent_id;
    END IF;
    
    -- Update path
    NEW.path := calculate_module_path(NEW.id);
    
    -- Prevent circular references
    IF NEW.parent_id IS NOT NULL THEN
        IF EXISTS (
            WITH RECURSIVE hierarchy AS (
                SELECT id, parent_id FROM form_modules WHERE id = NEW.parent_id
                UNION ALL
                SELECT fm.id, fm.parent_id 
                FROM form_modules fm 
                JOIN hierarchy h ON fm.id = h.parent_id
            )
            SELECT 1 FROM hierarchy WHERE id = NEW.id
        ) THEN
            RAISE EXCEPTION 'Circular reference detected in module hierarchy';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for hierarchy updates
DROP TRIGGER IF EXISTS trigger_update_module_hierarchy ON form_modules;
CREATE TRIGGER trigger_update_module_hierarchy
    BEFORE INSERT OR UPDATE ON form_modules
    FOR EACH ROW
    EXECUTE FUNCTION update_module_hierarchy();

-- Create view for hierarchical module statistics
CREATE OR REPLACE VIEW module_hierarchy_stats AS
WITH RECURSIVE module_tree AS (
    -- Root modules
    SELECT 
        id, name, parent_id, level, path, module_type,
        0 as depth,
        ARRAY[id] as path_array
    FROM form_modules 
    WHERE parent_id IS NULL
    
    UNION ALL
    
    -- Child modules
    SELECT 
        fm.id, fm.name, fm.parent_id, fm.level, fm.path, fm.module_type,
        mt.depth + 1,
        mt.path_array || fm.id
    FROM form_modules fm
    JOIN module_tree mt ON fm.parent_id = mt.id
),
module_stats AS (
    SELECT 
        fm.id,
        fm.name,
        fm.parent_id,
        fm.level,
        fm.path,
        fm.module_type,
        COUNT(DISTINCT child.id) as child_count,
        COUNT(DISTINCT f.id) as form_count,
        COUNT(DISTINCT fr.id) as record_count
    FROM form_modules fm
    LEFT JOIN form_modules child ON child.parent_id = fm.id
    LEFT JOIN forms f ON f.module_id = fm.id
    LEFT JOIN form_records fr ON fr.form_id = f.id
    GROUP BY fm.id, fm.name, fm.parent_id, fm.level, fm.path, fm.module_type
)
SELECT 
    mt.*,
    ms.child_count,
    ms.form_count,
    ms.record_count
FROM module_tree mt
JOIN module_stats ms ON mt.id = ms.id
ORDER BY mt.path_array;

-- Create lookup sources and field relations tables if they don't exist
CREATE TABLE IF NOT EXISTS lookup_sources (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    source_module_id TEXT REFERENCES form_modules(id) ON DELETE CASCADE,
    source_form_id TEXT REFERENCES forms(id) ON DELETE CASCADE,
    api_endpoint TEXT,
    static_data JSONB,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lookup_field_relations (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    lookup_source_id TEXT NOT NULL REFERENCES lookup_sources(id) ON DELETE CASCADE,
    form_field_id TEXT NOT NULL REFERENCES form_fields(id) ON DELETE CASCADE,
    form_id TEXT NOT NULL,
    module_id TEXT NOT NULL,
    display_field TEXT,
    value_field TEXT,
    multiple BOOLEAN,
    searchable BOOLEAN,
    filters JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for lookup tables
CREATE INDEX IF NOT EXISTS idx_lookup_sources_type ON lookup_sources(type);
CREATE INDEX IF NOT EXISTS idx_lookup_sources_active ON lookup_sources(active);
CREATE INDEX IF NOT EXISTS idx_lookup_sources_module ON lookup_sources(source_module_id);
CREATE INDEX IF NOT EXISTS idx_lookup_sources_form ON lookup_sources(source_form_id);

CREATE INDEX IF NOT EXISTS idx_lookup_field_relations_source ON lookup_field_relations(lookup_source_id);
CREATE INDEX IF NOT EXISTS idx_lookup_field_relations_field ON lookup_field_relations(form_field_id);
CREATE INDEX IF NOT EXISTS idx_lookup_field_relations_form ON lookup_field_relations(form_id);
CREATE INDEX IF NOT EXISTS idx_lookup_field_relations_module ON lookup_field_relations(module_id);

-- Add legacy lookup fields to form_fields if they don't exist
ALTER TABLE form_fields 
ADD COLUMN IF NOT EXISTS source_module TEXT,
ADD COLUMN IF NOT EXISTS source_form TEXT,
ADD COLUMN IF NOT EXISTS display_field TEXT,
ADD COLUMN IF NOT EXISTS value_field TEXT,
ADD COLUMN IF NOT EXISTS multiple BOOLEAN,
ADD COLUMN IF NOT EXISTS searchable BOOLEAN,
ADD COLUMN IF NOT EXISTS filters JSONB;

COMMIT;
