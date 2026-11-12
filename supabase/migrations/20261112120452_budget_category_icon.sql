-- Budget: let users pick an icon for a subcategory (budget_categories row).
-- null  = default (the built-in icon for a starter name, else its first letter)
-- 'letter' = always show the first letter
-- any other value = a key from the icon library in budget/index.html
alter table public.budget_categories
  add column icon text check (icon is null or (length(icon) between 1 and 40 and icon ~ '^[a-z0-9-]+$'));
