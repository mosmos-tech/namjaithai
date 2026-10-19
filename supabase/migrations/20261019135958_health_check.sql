-- ตารางเล็กๆ ไว้เช็กว่าเว็บเชื่อมฐานข้อมูลได้ (TF-02)
create table public.health_check (
  id int primary key,
  message text not null
);

alter table public.health_check enable row level security;
create policy "anyone can read health_check"
  on public.health_check for select using (true);
grant select on public.health_check to anon, authenticated;

insert into public.health_check (id, message)
values (1, 'เชื่อมต่อฐานข้อมูลสำเร็จ 🎉');
