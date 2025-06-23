using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ValHelpApi.Migrations
{
    /// <inheritdoc />
    public partial class MakeOwnerRequired : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<uint>(
                name: "xmin",
                table: "players",
                type: "xid",
                rowVersion: true,
                nullable: false,
                defaultValue: 0u);

            migrationBuilder.AddColumn<bool>(
                name: "is_private",
                table: "events",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "owner_id",
                table: "events",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.CreateIndex(
                name: "ix_events_owner_id",
                table: "events",
                column: "owner_id");

            migrationBuilder.AddForeignKey(
                name: "fk_events_users_owner_id",
                table: "events",
                column: "owner_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_events_users_owner_id",
                table: "events");

            migrationBuilder.DropIndex(
                name: "ix_events_owner_id",
                table: "events");

            migrationBuilder.DropColumn(
                name: "xmin",
                table: "players");

            migrationBuilder.DropColumn(
                name: "is_private",
                table: "events");

            migrationBuilder.DropColumn(
                name: "owner_id",
                table: "events");
        }
    }
}
