import random
import string


def random_string(length):
    chars = "ABCDEFGHJKLMNPQRTUVWXYZ23456789"
    base_string = "".join(random.choice(chars) for _ in range(length - 4))
    insert_index = random.randint(1, length - 4)  # Ensure index is never 0
    return base_string[:insert_index] + "saga" + base_string[insert_index:]


def generate_seeds(count, length):
    return [random_string(length) for _ in range(count)]


if __name__ == "__main__":
    seeds = generate_seeds(100, 10)
    for seed in seeds:
        print(seed)
