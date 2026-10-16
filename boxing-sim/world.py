import math


class World:
    FIGHT_DURATION = 600

    def __init__(self, center, radius):
        self.center = center
        self.radius = radius

    def scripted_bull_ai(self, bull, matador, frame):
        dist = bull.dist_to(matador)
        fwd = 0.85 if dist > 70 else 0.35

        mat_dist = matador.dist_from_center(*self.center)
        if mat_dist > self.radius * 0.55:
            fwd = min(1.0, fwd + 0.3)

        circle = 0.0
        if dist < 120:
            angle_to_mat = bull.angle_to(matador)
            cx, cy = self.center
            mat_angle = math.atan2(matador.y - cy, matador.x - cx)
            diff = math.sin(angle_to_mat - mat_angle)
            circle = 0.3 if diff > 0 else -0.3

        jab = 0.0
        cross = 0.0
        if bull.punch_type == 0:
            if dist < 50 and frame % 50 < 18:
                cross = 1.0
            elif dist < 58:
                jab = 1.0
        if cross > 0.5:
            jab = 0.0

        return [fwd, circle, jab, cross, 0.0]

    def check_punch(self, attacker, defender, frame):
        if not attacker.is_punch_active():
            return

        dist = attacker.dist_to(defender)
        reach = attacker.get_punch_reach()

        if dist < reach + defender.RADIUS and not attacker.punch_landed_this:
            attacker.punch_landed_this = True
            damage = attacker.get_punch_damage()
            if defender.is_blocking:
                damage *= 0.25
            defender.health -= damage
            defender.damage_taken += damage
            attacker.damage_dealt += damage
            attacker.punches_landed += 1
            if frame - attacker.last_dodged_frame < 20:
                attacker.counter_punches += 1

        last_active = attacker.PUNCH_WINDUP + attacker.PUNCH_ACTIVE - 1
        if attacker.punch_frame == last_active and not attacker.punch_landed_this:
            defender.punches_dodged += 1
            defender.last_dodged_frame = frame

    def enforce_boundary(self, fighter):
        cx, cy = self.center
        dx = fighter.x - cx
        dy = fighter.y - cy
        dist = math.sqrt(dx * dx + dy * dy)
        limit = self.radius - fighter.RADIUS
        if dist > limit and dist > 0:
            scale = limit / dist
            fighter.x = cx + dx * scale
            fighter.y = cy + dy * scale
            fighter.vx *= -0.3
            fighter.vy *= -0.3

    def update(self, matador, bull, frame):
        self.enforce_boundary(matador)
        self.enforce_boundary(bull)

        dist = matador.dist_to(bull)
        min_d = matador.RADIUS + bull.RADIUS + 4
        if 0 < dist < min_d:
            overlap = (min_d - dist) / 2
            angle = math.atan2(matador.y - bull.y, matador.x - bull.x)
            cos_a = math.cos(angle)
            sin_a = math.sin(angle)
            matador.x += cos_a * overlap
            matador.y += sin_a * overlap
            bull.x -= cos_a * overlap
            bull.y -= sin_a * overlap

        self.check_punch(bull, matador, frame)
        self.check_punch(matador, bull, frame)

        mat_dist = matador.dist_from_center(*self.center)
        if mat_dist < self.radius * 0.35:
            matador.center_time += 1
        if mat_dist > self.radius * 0.8:
            matador.rope_time += 1

    def calculate_fitness(self, matador):
        f = 0.0
        f += matador.center_time * 1.5
        f -= matador.rope_time * 2.0
        f += matador.punches_dodged * 40
        f += matador.punches_landed * 60
        f += matador.counter_punches * 100
        f -= matador.damage_taken * 3
        f += (matador.health / 100.0) * 300
        return max(0.0, f)
