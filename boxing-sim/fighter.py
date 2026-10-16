import math


class Fighter:
    RADIUS = 12
    MAX_SPEED = 3.5
    MAX_STAMINA = 100.0
    JAB_RANGE = 38
    CROSS_RANGE = 48
    JAB_DAMAGE = 8
    CROSS_DAMAGE = 14
    JAB_STAMINA = 6
    CROSS_STAMINA = 12
    PUNCH_WINDUP = 5
    PUNCH_ACTIVE = 3
    PUNCH_RECOVERY = 10

    def __init__(self, x, y, role):
        self.x = x
        self.y = y
        self.role = role
        self.vx = 0.0
        self.vy = 0.0
        self.health = 100.0
        self.stamina = self.MAX_STAMINA
        self.punch_type = 0
        self.punch_frame = 0
        self.punch_landed_this = False
        self.is_blocking = False
        self.punches_thrown = 0
        self.punches_landed = 0
        self.punches_dodged = 0
        self.counter_punches = 0
        self.damage_dealt = 0.0
        self.damage_taken = 0.0
        self.center_time = 0
        self.rope_time = 0
        self.last_dodged_frame = -100
        self.circle_left_count = 0
        self.circle_right_count = 0

    def angle_to(self, other):
        return math.atan2(other.y - self.y, other.x - self.x)

    def dist_to(self, other):
        dx = other.x - self.x
        dy = other.y - self.y
        return math.sqrt(dx * dx + dy * dy)

    def dist_from_center(self, cx, cy):
        dx = self.x - cx
        dy = self.y - cy
        return math.sqrt(dx * dx + dy * dy)

    def sense(self, opponent, ring_center, ring_radius):
        dist = self.dist_to(opponent)
        norm_dist = min(dist / (ring_radius * 2), 1.0)

        opp_angle = math.atan2(self.y - opponent.y, self.x - opponent.x)
        opp_closing = (opponent.vx * math.cos(opp_angle)
                       + opponent.vy * math.sin(opp_angle))
        closing_rate = max(-1.0, min(1.0, opp_closing / self.MAX_SPEED))

        norm_stamina = self.stamina / self.MAX_STAMINA

        cx, cy = ring_center
        angle = self.angle_to(opponent)

        def wall_ray(a):
            dx, dy = math.cos(a), math.sin(a)
            ox, oy = self.x - cx, self.y - cy
            b = 2 * (ox * dx + oy * dy)
            c = ox * ox + oy * oy - ring_radius * ring_radius
            disc = b * b - 4 * c
            if disc < 0:
                return 1.0
            t = (-b + math.sqrt(max(0, disc))) / 2
            return max(0.0, min(1.0, t / (ring_radius * 2)))

        wall_behind = wall_ray(angle + math.pi)
        wall_left = wall_ray(angle + math.pi / 2)
        wall_right = wall_ray(angle - math.pi / 2)

        opp_punching = 1.0 if opponent.punch_type > 0 else 0.0
        norm_health = self.health / 100.0

        return [norm_dist, closing_rate, norm_stamina,
                wall_behind, wall_left, wall_right,
                opp_punching, norm_health]

    def apply_action(self, outputs, opponent):
        move_fb = max(-1.0, min(1.0, outputs[0]))
        circle = max(-1.0, min(1.0, outputs[1]))
        want_jab = outputs[2] > 0.5
        want_cross = outputs[3] > 0.5
        want_block = outputs[4] > 0.5

        if circle > 0.1:
            self.circle_right_count += 1
        elif circle < -0.1:
            self.circle_left_count += 1

        angle = self.angle_to(opponent)
        speed_mult = 0.3 if self.is_blocking else 1.0
        fwd = move_fb * self.MAX_SPEED * speed_mult
        lat = circle * self.MAX_SPEED * 0.7 * speed_mult

        self.vx = (math.cos(angle) * fwd
                    + math.cos(angle + math.pi / 2) * lat)
        self.vy = (math.sin(angle) * fwd
                    + math.sin(angle + math.pi / 2) * lat)

        speed = math.sqrt(self.vx * self.vx + self.vy * self.vy)
        self.stamina = max(0, self.stamina - speed * 0.02)

        self.is_blocking = False

        if self.punch_type > 0:
            self.punch_frame += 1
            total = self.PUNCH_WINDUP + self.PUNCH_ACTIVE + self.PUNCH_RECOVERY
            if self.punch_frame >= total:
                self.punch_type = 0
                self.punch_frame = 0
        else:
            if want_jab and self.stamina > self.JAB_STAMINA:
                self.punch_type = 1
                self.punch_frame = 0
                self.punch_landed_this = False
                self.punches_thrown += 1
                self.stamina -= self.JAB_STAMINA
            elif want_cross and self.stamina > self.CROSS_STAMINA:
                self.punch_type = 2
                self.punch_frame = 0
                self.punch_landed_this = False
                self.punches_thrown += 1
                self.stamina -= self.CROSS_STAMINA
            elif want_block:
                self.is_blocking = True

        if speed < 0.5 and self.punch_type == 0:
            self.stamina = min(self.MAX_STAMINA, self.stamina + 0.15)

        self.x += self.vx
        self.y += self.vy

    def is_punch_active(self):
        if self.punch_type == 0:
            return False
        return (self.PUNCH_WINDUP
                <= self.punch_frame
                < self.PUNCH_WINDUP + self.PUNCH_ACTIVE)

    def get_punch_reach(self):
        if self.punch_type == 1:
            return self.JAB_RANGE
        if self.punch_type == 2:
            return self.CROSS_RANGE
        return 0

    def get_punch_damage(self):
        if self.punch_type == 1:
            return self.JAB_DAMAGE
        if self.punch_type == 2:
            return self.CROSS_DAMAGE
        return 0
