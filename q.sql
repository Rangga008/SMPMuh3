SELECT u.email, e.id AS emp_id, e.name, e.type, e.is_active
FROM users u LEFT JOIN employees e ON e.user_id = u.id
WHERE u.email IN ('admin@smpm3bdg.sch.id','kepsek@smpm3bdg.sch.id','atihwidya@gmail.com')
ORDER BY u.email;
