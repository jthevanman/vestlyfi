-- Budget: categories (budget_groups rows) carry the icon; subcategories show their category's icon.
-- null  = default (the built-in icon for a starter name, else its first letter)
-- 'letter' = always show the first letter
-- any other value = a key from the icon library in budget/index.html
alter table public.budget_groups
  add column icon text check (icon is null or (length(icon) between 1 and 40 and icon ~ '^[a-z0-9-]+$'));
